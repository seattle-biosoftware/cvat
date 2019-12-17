/*
 * Copyright (C) 2018 Intel Corporation
 *
 * SPDX-License-Identifier: MIT
 */

/* exported PlayerModel PlayerController PlayerView */

/* global
    blurAllElements:false
    copyToClipboard:false
    Listener:false
    Logger:false
    Mousetrap:false
*/

'use strict';

let SETTINGS_FPS = null;

class FrameProvider extends Listener {
    constructor(stop, tid) {
        /**	
         * On "_loaded" property change - triggers 'onFrameLoad' event	
         */
        super('onFrameLoad', () => this._loaded);

        /**	
         * Crnt frame which was not loaded	
         * @type {Number}	
         */
        this._required = null;

        /**	
         * Triggers 'onFrameLoad' event on this property change	
         * @type {Number}	
         */
        this._loaded = null;

        /**	
         * Store frame collection	
         * @type {Object}	
         */
        this._frameCollection = {};

        /**	
         * All frames count of video	
         * @type {Number}	
         */
        this._stop = stop;

        /**	
         * Task id	
         * @type {Number}	
         */
        this._tid = tid;

        /**	
         * How many frames include one packet (tar file of frames)	
         * @type {Number}	
         */	
        this._loadFramesInPacket = 25;	

        /**	
         * Disable if frame loading is valid	
         * @type {Boolean}	
         */	
        this._loadFramesInPacketAllowed = true;	

        /**	
         * Frames are loading	
         * @type {Boolean}	
         */	
        this._framesAreLoading = false;	

        /**	
         * Array of loaded frames (frame idxes)	
         * @type {Array<Number>}	
         */	
        this._loadedFrames = [];	

        /**	
         * HTML element of progress bar	
         * Displays downloaded frames from server	
         * @type {HTMLElement}	
         */	
        this._preloadedProgressUI = $("#preloadedProgressBar");	

        /**	
         * HTML element of player progress	
         * @type {HTMLElement}	
         */	
        this.playerProgressUI = $("#playerProgress");

        /**	
         * Detect loading of first frame	
         * @type {Boolean}	
         */	
        this._firstLoading = true;	

        /**	
         * Save passed of last frame if we started load frames by required frame	
         * @type {Array<Number>}	
         */	
        this._passedFrameIdx = [];

        /**	
         * Loading past frames	
         * @type {Boolean}	
         */	
        this._loadingPastFrames = false;

        /**	
         * Loading bar has drawn	
         * @type {Boolean}	
         */	
        this._loadingBarDrawn = false;

        /**	
         * Set delay of frames loading	
         * @type {function}	
         */	
        this._timeoutLoading = null;

        /**	
         * Max length of saved frames in object	
         * @type {Number}	
         */	
        this._MAX_FRAMES_LENGTH = 15000;

        /**	
         * Disable previous frames loading	
         * @type {Boolean}	
         */	
        this._disablePreviuosLoading = false;
    }

    /**	
     * Return crnt frame image if it exists in collection. If not - call method to load it	
     * @param {Number} frame 	
     * @returns {Image} image	
     */
    require(frame) {
        if (frame in this._frameCollection) {

            return this._frameCollection[frame];
        }
        // If frame is selected and not loaded - load it
        this._required = frame;
        this._loadFramesInPacketAllowed = true;	
        this._disablePreviuosLoading = true;	
        this._load(true);
        return null;
    }

    /**	
     * Method trigger after image loading	
     * Returns true/false if image loading in collection is success	
     * @param {Image} image 	
     * @param {Number} frame 	
     * @returns {Boolean}	
     */
    _onImageLoad(image, frame) {
	    // Player has limit of loaded frames. If limit was broken, we remove first loaded frame	
        if (this._loadedFrames.length >= this._MAX_FRAMES_LENGTH) {	
            if (window.cvat.player.frames.current !== this._loadedFrames[0]) {	
                this._loaded = frame;	
                this._frameCollection[frame] = image;	
                this._loadedFrames.push(frame);

                this._loadedFrames.splice(0, 1);	
                delete this._frameCollection[this._loadedFrames[0]];	

                this.notify();	
                return true;	
            } else {	
                this.notify();	
                return false;	
            }	
        } else {	
            this._loaded = frame;	
            this._frameCollection[frame] = image;	
            this._loadedFrames.push(frame);	
            this.notify();	
            return true;
        }
    }

	/**	
     * Get start/end frames to load them. If we have 'required' frames to load, we need to stop prev frames loading execution	
     * @param {Boolean} allowLoading	
     */	
    _load(allowLoading = false) {	
        clearTimeout(this._timeoutLoading);	
        let self = this;	
        this._timeoutLoading = setTimeout(() => {	
            if (self._disablePreviuosLoading) {	
                if (!allowLoading) return;	
            }	
            if (!self._loadFramesInPacketAllowed) return;	
            // Next loading is valid after packet parsing	
            self._loadFramesInPacketAllowed = false;

            // Set frame range to get from packet	
            let startFrame;	
            if (self._firstLoading) {	
                startFrame = 0;	
                self._firstLoading = false;	
            } else if (self._required !== null && self._required !== undefined && self._required !== 0) {	
                startFrame = self._required;	
                self._required = null;	
            } else {	
                startFrame = self._loadedFrames[self._loadedFrames.length - 1] + 1;	
            }	
            let endFrame = startFrame + self._loadFramesInPacket - 1;	
            if (endFrame >= this._stop) endFrame = this._stop;	

            if (Object.keys(this._frameCollection).length >= this._stop) {	
                self._updatePreLoadedProgressBar(this._stop);	
                return;	
            }	

            this._loadFramesInPacketAPI(startFrame, endFrame);	
        }, 300);	
    }	
    /**	
     * Load frames in packet (.tar)	
     * @param {Number} startFrame 	
     * @param {Number} endFrame 	
     */	
    _loadFramesInPacketAPI(startFrame, endFrame) {	
        // Open and create HTTP request	
        const xhr = new XMLHttpRequest();	
        xhr.responseType = 'blob';	

        let startTime = null;	
        let endTime = null;	
        startTime = new Date().getTime();

        xhr.open('GET', `/api/v1/tasks/${this._tid}/frames_packet/${startFrame}/${endFrame}`, true);
        xhr.send();	

        let self = this;	
        xhr.onreadystatechange = function () {	
            if (xhr.readyState == XMLHttpRequest.DONE && xhr.status == 200) {	
                // Detect client/server delay	
                endTime = new Date().getTime();	
                self._detectFPSByPacketDelay(startTime, endTime, self._loadFramesInPacket);	

                if (self._disablePreviuosLoading) {	
                    self._disablePreviuosLoading = false;	
                }	

                new Response(xhr.response).arrayBuffer()	
                    .then(data => {	
                        untar(data)	
                            .then(function (extractedFiles) {	
                                for (let i = 0; i < extractedFiles.length; i++) {	
                                    const image = new Image();	
                                    image.src = extractedFiles[i].getBlobUrl();

                                    image.onload = () => {	
                                        if (self._disablePreviuosLoading) {	
                                            return;	
                                        }

                                        let frameIdx = startFrame + i;	
                                        // if (self._loadedFrames.indexOf(frameIdx) !== -1) return;	

                                        if (self._onImageLoad(image, frameIdx)) {	
                                            self._updatePreLoadedProgressBar(frameIdx);	
                                        }

                                        // self._loadFramesInPacketAllowed = false;	


                                        // If all frames in packet are loaded - start frame reloading process from next unloaded frame idx	
                                        if (i === self._loadFramesInPacket - 1 && !self._disablePreviuosLoading) {	
                                            self._loadFramesInPacketAllowed = true;	
                                            self._load();	

                                            image.onload = null;	
                                            image.onerror = null;	
                                        }	
                                    }	
                                    image.onerror = () => {	
                                        image.onload = null;	
                                        image.onerror = null;	
                                    };	
                                }	
                            });	
                    })	
            }	
        };	
    }

    /**	
     * Detect FPS which depends on download speed of packet of frames	
     * @param {Number} startTime 	
     * @param {Number} endTime 	
     * @param {Number} loadedFrames. Loaded frames by packet	
     */	
    _detectFPSByPacketDelay(startTime = 0, endTime = 0, loadedFrames = 0) {	
        if (endTime === null && startTime === null) return;	
        const delay = (endTime - startTime + 450) / loadedFrames; // Delay per 1 frame	
        let fps = 800 / delay;	
        if (fps > 25) fps = 25;	
        if (fps < 1) fps = 1;	
        SETTINGS_FPS = Math.floor(fps);	
    }

    /**	
     * FPS will be depends on ping (1 frame downloading time)	
     * This method dynamically changes FPS	
     * @param {Number} startTime 	
     * @param {Number} endTime 	
     */	
    _FPSChangeByPing(startTime = 0, endTime = 0) {	
        if (endTime === null && startTime === null) return;	
        const delay = endTime - startTime;	
        // Get FPS value dividing 1000ms (800ms considering relative error)	
        let fps = 800 / delay;	
        if (fps > 25) fps = 25;	
        if (fps < 1) fps = 1;	
        SETTINGS_FPS = Math.round(fps);	
    }

    /**	
     * Update progress bar of loaded frames	
     * Method calls after frame loading from server	
     * @type {Number} frameIdx	
     */	
    _updatePreLoadedProgressBar(frameIdx) {	
        if (frameIdx === undefined || frameIdx === null) return;

        const barWidthPx = parseFloat(this.playerProgressUI.width()) / (this._stop + 1);	
        const barWidthPercent = barWidthPx / parseFloat(this.playerProgressUI.width()) * 100;	
        const loadedWidthPercent = frameIdx * barWidthPercent;	
        this._preloadedProgressUI.css("width", `${loadedWidthPercent}%`)	
    }	
}


const MAX_PLAYER_SCALE = 10;
const MIN_PLAYER_SCALE = 0.1;

class PlayerModel extends Listener {
    constructor(task, playerSize) {
        super('onPlayerUpdate', () => this);
        this._frame = {
            start: window.cvat.player.frames.start,
            stop: window.cvat.player.frames.stop,
            current: window.cvat.player.frames.current,
            previous: null,
        };

        this._settings = {
            multipleStep: 10,
            fps: 25,
            rotateAll: task.mode === 'interpolation',
            resetZoom: task.mode === 'annotation',
        };

        this._playInterval = null;
        this._pauseFlag = null;
        this._frameProvider = new FrameProvider(this._frame.stop, task.id);
        this._continueAfterLoad = false;
        this._continueTimeout = null;

        this._geometry = {
            scale: 1,
            left: 0,
            top: 0,
            width: playerSize.width,
            height: playerSize.height,
            frameOffset: 0,
            rotation: 0,
        };
        this._framewiseRotation = {};
        const frameOffset = Math.max((playerSize.height - MIN_PLAYER_SCALE) / MIN_PLAYER_SCALE,
            (playerSize.width - MIN_PLAYER_SCALE) / MIN_PLAYER_SCALE);
        this._geometry.frameOffset = Math.floor(frameOffset);
        window.cvat.translate.playerOffset = this._geometry.frameOffset;
        window.cvat.player.rotation = this._geometry.rotation;

        /**	
         * HTML element of progress bar	
         * Displays played frames from server	
         * @type {HTMLElement}	
         */	
        this._loadedProgressUI = $("#loadedProgressBar");

        this._frameProvider.subscribe(this);
    }

    get frames() {
        return {
            start: this._frame.start,
            stop: this._frame.stop,
            current: this._frame.current,
            previous: this._frame.previous,
        };
    }

    get geometry() {
        const copy = Object.assign({}, this._geometry);
        copy.rotation = this._settings.rotateAll ? this._geometry.rotation
            : this._framewiseRotation[this._frame.current] || 0;
        return copy;
    }

    get playing() {
        return this._playInterval != null;
    }

    get image() {
        return this._frameProvider.require(this._frame.current);
    }

    get resetZoom() {
        return this._settings.resetZoom;
    }

    get multipleStep() {
        return this._settings.multipleStep;
    }

    get rotateAll() {
        return this._settings.rotateAll;
    }

    set rotateAll(value) {
        this._settings.rotateAll = value;

        if (!value) {
            this._geometry.rotation = 0;
        } else {
            this._framewiseRotation = {};
        }

        this.fit();
    }

    set fps(value) {
        this._settings.fps = value;
    }

    set multipleStep(value) {
        this._settings.multipleStep = value;
    }

    set resetZoom(value) {
        this._settings.resetZoom = value;
    }

    ready() {
        return this._frame.previous === this._frame.current;
    }

    onFrameLoad(last) { // callback for FrameProvider instance
        if (last === this._frame.current) {
            if (this._continueTimeout) {
                clearTimeout(this._continueTimeout);
                this._continueTimeout = null;
            }

            // If need continue playing after load, set timeout for additional frame download
            if (this._continueAfterLoad) {
                this._continueTimeout = setTimeout(() => {
                    // If you still need to play, start it
                    this._continueTimeout = null;
                    if (this._continueAfterLoad) {
                        this._continueAfterLoad = false;
                        this.play();
                    } else { // Else update the frame
                        this.shift(0);
                    }
                }, 500);
            } else { // Just update frame if no need to play
                this.shift(0);
                this._updatePlayedProgressBar(this._frame.current)
            }
        }
    }

    play() {
        this._pauseFlag = false;
        let idx = 0;
        this._playInterval = setInterval(() => {
            if (this._pauseFlag) { // pause method without notify (for frame downloading)
                if (this._playInterval) {
                    clearInterval(this._playInterval);
                    this._playInterval = null;
                }
                return;
            }

            // Set default FPS value if all frames are loaded	
            if (Object.keys(this._frameProvider._frameCollection).length - 1 === this._frame.stop) {	
                this._settings.fps = 25;	
                SETTINGS_FPS = 25;	
                clearInterval(this._playInterval);	
                this._playInterval = null;	
                this.play();	
            }

            // Set default FPS value if storage of loaded frames are more than 75 frames	
            if ((this._frame.current + 75) in this._frameProvider._frameCollection) {	
                this._settings.fps = 25;	
                // SETTINGS_FPS = 25;	
                clearInterval(this._playInterval);	
                this._playInterval = null;	
                this.play();	
            }

            // Change video FPS every 2 frame	
            if (idx > 2) {	
                clearInterval(this._playInterval);	
                this._playInterval = null;	
                this.play();	
            }	
            idx++;

            if (SETTINGS_FPS !== null) this._settings.fps = SETTINGS_FPS;
            const skip = Math.max(Math.floor(this._settings.fps / 25), 1);
            this._updatePlayedProgressBar(this._frame.current);
            if (!this.shift(skip)) this.pause(); // if not changed, pause
        }, 1000 / this._settings.fps);
    }

    /**	
     * Update progress bar of prev frames	
     * Method calls after frame playing	
     * @type {Number} frameIdx	
     */	
    _updatePlayedProgressBar(frameIdx) {	
        if (frameIdx === undefined || frameIdx === null) return;	
        const barWidthPx = parseFloat(this._frameProvider.playerProgressUI.width()) / (this._frameProvider._stop + 1);	
        const barWidthPercent = barWidthPx / parseFloat(this._frameProvider.playerProgressUI.width()) * 100;	
        const loadedWidthPercent = frameIdx * barWidthPercent;	
        this._loadedProgressUI.css("width", `${loadedWidthPercent}%`)	
    }

    pause() {
        if (this._playInterval) {
            clearInterval(this._playInterval);
            this._playInterval = null;
            this._pauseFlag = true;
            this.notify();
        }
    }

    updateGeometry(geometry) {
        this._geometry.width = geometry.width;
        this._geometry.height = geometry.height;
    }

    shift(delta, absolute) {
        if (['resize', 'drag'].indexOf(window.cvat.mode) !== -1) {
            return false;
        }

        this._continueAfterLoad = false; // default reset continue
        this._frame.current = Math.clamp(absolute ? delta : this._frame.current + delta,
            this._frame.start,
            this._frame.stop);
        const frame = this._frameProvider.require(this._frame.current);
        if (!frame) {
            this._continueAfterLoad = this.playing;
            this._pauseFlag = true;
            this.notify();
            return false;
        }

        window.cvat.player.frames.current = this._frame.current;
        window.cvat.player.geometry.frameWidth = frame.width;
        window.cvat.player.geometry.frameHeight = frame.height;

        Logger.addEvent(Logger.EventType.changeFrame, {
            from: this._frame.previous,
            to: this._frame.current,
        });

        const changed = this._frame.previous !== this._frame.current;
        const curFrameRotation = this._framewiseRotation[this._frame.current];
        const prevFrameRotation = this._framewiseRotation[this._frame.previous];
        const differentRotation = curFrameRotation !== prevFrameRotation;
        // fit if tool is in the annotation mode or frame loading is first in the interpolation mode
        if (this._settings.resetZoom || this._frame.previous === null || differentRotation) {
            this._frame.previous = this._frame.current;
            this.fit(); // notify() inside the fit()
        } else {
            this._frame.previous = this._frame.current;
            this.notify();
        }

        return changed;
    }

    fit() {
        const img = this._frameProvider.require(this._frame.current);
        if (!img) return;

        const {
            rotation
        } = this.geometry;

        if ((rotation / 90) % 2) {
            // 90, 270, ..
            this._geometry.scale = Math.min(this._geometry.width / img.height,
                this._geometry.height / img.width);
        } else {
            // 0, 180, ..
            this._geometry.scale = Math.min(this._geometry.width / img.width,
                this._geometry.height / img.height);
        }

        this._geometry.top = (this._geometry.height - img.height * this._geometry.scale) / 2;
        this._geometry.left = (this._geometry.width - img.width * this._geometry.scale) / 2;

        window.cvat.player.rotation = rotation;
        window.cvat.player.geometry.scale = this._geometry.scale;
        this.notify();
    }

    focus(xtl, xbr, ytl, ybr) {
        const img = this._frameProvider.require(this._frame.current);
        if (!img) return;
        const fittedScale = Math.min(this._geometry.width / img.width,
            this._geometry.height / img.height);

        const boxWidth = xbr - xtl;
        const boxHeight = ybr - ytl;
        const wScale = this._geometry.width / boxWidth;
        const hScale = this._geometry.height / boxHeight;
        this._geometry.scale = Math.min(wScale, hScale);
        this._geometry.scale = Math.min(this._geometry.scale, MAX_PLAYER_SCALE);
        this._geometry.scale = Math.max(this._geometry.scale, MIN_PLAYER_SCALE);

        if (this._geometry.scale < fittedScale) {
            this._geometry.scale = fittedScale;
            this._geometry.top = (this._geometry.height - img.height * this._geometry.scale) / 2;
            this._geometry.left = (this._geometry.width - img.width * this._geometry.scale) / 2;
        } else {
            this._geometry.left = (this._geometry.width / this._geometry.scale - xtl * 2 - boxWidth) * this._geometry.scale / 2;
            this._geometry.top = (this._geometry.height / this._geometry.scale - ytl * 2 - boxHeight) * this._geometry.scale / 2;
        }
        window.cvat.player.geometry.scale = this._geometry.scale;
        this._frame.previous = this._frame.current; // fix infinite loop via playerUpdate->collectionUpdate*->AAMUpdate->playerUpdate->...
        this.notify();
    }

    scale(point, value) {
        if (!this._frameProvider.require(this._frame.current)) return;

        const oldScale = this._geometry.scale;
        const newScale = value > 0 ? this._geometry.scale * 6 / 5 : this._geometry.scale * 5 / 6;
        this._geometry.scale = Math.clamp(newScale, MIN_PLAYER_SCALE, MAX_PLAYER_SCALE);

        this._geometry.left += (point.x * (oldScale / this._geometry.scale - 1)) * this._geometry.scale;
        this._geometry.top += (point.y * (oldScale / this._geometry.scale - 1)) * this._geometry.scale;

        window.cvat.player.geometry.scale = this._geometry.scale;
        this.notify();
    }

    move(topOffset, leftOffset) {
        this._geometry.top += topOffset;
        this._geometry.left += leftOffset;
        this.notify();
    }

    rotate(angle) {
        if (['resize', 'drag'].indexOf(window.cvat.mode) !== -1) {
            return false;
        }

        if (this._settings.rotateAll) {
            this._geometry.rotation += angle;
            this._geometry.rotation %= 360;
        } else if (typeof (this._framewiseRotation[this._frame.current]) === 'undefined') {
            this._framewiseRotation[this._frame.current] = angle;
        } else {
            this._framewiseRotation[this._frame.current] += angle;
            this._framewiseRotation[this._frame.current] %= 360;
        }

        this.fit();
    }
}


class PlayerController {
    constructor(playerModel, activeTrack, find, playerOffset) {
        this._model = playerModel;
        this._find = find;
        this._rewinding = false;
        this._moving = false;
        this._leftOffset = playerOffset.left;
        this._topOffset = playerOffset.top;
        this._lastClickX = 0;
        this._lastClickY = 0;
        this._moveFrameEvent = null;
        this._events = {
            jump: null,
            move: null,
        };

        function setupPlayerShortcuts(playerModel) {
            const nextHandler = Logger.shortkeyLogDecorator((e) => {
                this.next();
                e.preventDefault();
            });

            const prevHandler = Logger.shortkeyLogDecorator((e) => {
                this.previous();
                e.preventDefault();
            });

            const nextKeyFrameHandler = Logger.shortkeyLogDecorator(() => {
                const active = activeTrack();
                if (active && active.type.split('_')[0] === 'interpolation') {
                    const nextKeyFrame = active.nextKeyFrame();
                    if (nextKeyFrame != null) {
                        this._model.shift(nextKeyFrame, true);
                    }
                }
            });

            const prevKeyFrameHandler = Logger.shortkeyLogDecorator(() => {
                const active = activeTrack();
                if (active && active.type.split('_')[0] === 'interpolation') {
                    const prevKeyFrame = active.prevKeyFrame();
                    if (prevKeyFrame != null) {
                        this._model.shift(prevKeyFrame, true);
                    }
                }
            });


            const nextFilterFrameHandler = Logger.shortkeyLogDecorator((e) => {
                const frame = this._find(1);
                if (frame != null) {
                    this._model.shift(frame, true);
                }
                e.preventDefault();
            });

            const prevFilterFrameHandler = Logger.shortkeyLogDecorator((e) => {
                const frame = this._find(-1);
                if (frame != null) {
                    this._model.shift(frame, true);
                }
                e.preventDefault();
            });


            const forwardHandler = Logger.shortkeyLogDecorator(() => {
                this.forward();
            });

            const backwardHandler = Logger.shortkeyLogDecorator(() => {
                this.backward();
            });

            const playPauseHandler = Logger.shortkeyLogDecorator(() => {
                if (playerModel.playing) {
                    this.pause();
                } else {
                    this.play();
                }
                return false;
            });

            const {
                shortkeys
            } = window.cvat.config;

            Mousetrap.bind(shortkeys.next_frame.value, nextHandler, 'keydown');
            Mousetrap.bind(shortkeys.prev_frame.value, prevHandler, 'keydown');
            Mousetrap.bind(shortkeys.next_filter_frame.value, nextFilterFrameHandler, 'keydown');
            Mousetrap.bind(shortkeys.prev_filter_frame.value, prevFilterFrameHandler, 'keydown');
            Mousetrap.bind(shortkeys.next_key_frame.value, nextKeyFrameHandler, 'keydown');
            Mousetrap.bind(shortkeys.prev_key_frame.value, prevKeyFrameHandler, 'keydown');
            Mousetrap.bind(shortkeys.forward_frame.value, forwardHandler, 'keydown');
            Mousetrap.bind(shortkeys.backward_frame.value, backwardHandler, 'keydown');
            Mousetrap.bind(shortkeys.play_pause.value, playPauseHandler, 'keydown');
            Mousetrap.bind(shortkeys.clockwise_rotation.value, (e) => {
                e.preventDefault();
                this.rotate(90);
            }, 'keydown');
            Mousetrap.bind(shortkeys.counter_clockwise_rotation.value, (e) => {
                e.preventDefault();
                this.rotate(-90);
            }, 'keydown');
        }

        setupPlayerShortcuts.call(this, playerModel);
    }

    zoom(e, canvas) {
        const point = window.cvat.translate.point.clientToCanvas(canvas, e.clientX, e.clientY);

        const zoomImageEvent = Logger.addContinuedEvent(Logger.EventType.zoomImage);

        if (e.originalEvent.deltaY < 0) {
            this._model.scale(point, 1);
        } else {
            this._model.scale(point, -1);
        }
        zoomImageEvent.close();
        e.preventDefault();
    }

    fit() {
        Logger.addEvent(Logger.EventType.fitImage);
        this._model.fit();
    }

    frameMouseDown(e) {
        if ((e.which === 1 && !window.cvat.mode) || (e.which === 2)) {
            this._moving = true;

            const p = window.cvat.translate.point.rotate(e.clientX, e.clientY);

            this._lastClickX = p.x;
            this._lastClickY = p.y;
        }
    }

    frameMouseUp() {
        this._moving = false;
        if (this._events.move) {
            this._events.move.close();
            this._events.move = null;
        }
    }

    frameMouseMove(e) {
        if (this._moving) {
            if (!this._events.move) {
                this._events.move = Logger.addContinuedEvent(Logger.EventType.moveImage);
            }

            const p = window.cvat.translate.point.rotate(e.clientX, e.clientY);
            const topOffset = p.y - this._lastClickY;
            const leftOffset = p.x - this._lastClickX;
            this._lastClickX = p.x;
            this._lastClickY = p.y;
            this._model.move(topOffset, leftOffset);
        }
    }

    progressMouseDown(e) {
        this._rewinding = true;
        this._rewind(e);
    }

    progressMouseUp() {
        this._rewinding = false;
        if (this._events.jump) {
            this._events.jump.close();
            this._events.jump = null;
        }
    }

    progressMouseMove(e) {
        this._rewind(e);
    }

    _rewind(e) {
        if (this._rewinding) {
            if (!this._events.jump) {
                this._events.jump = Logger.addContinuedEvent(Logger.EventType.jumpFrame);
            }

            const {
                frames
            } = this._model;
            const progressWidth = e.target.clientWidth;
            // const x = e.clientX + window.pageXOffset - e.target.offsetLeft;
            const x = e.offsetX + window.pageXOffset - e.target.offsetLeft;
            const percent = x / progressWidth;
            const targetFrame = Math.round((frames.stop - frames.start) * percent);
            this._model.pause();
            this._model.shift(targetFrame + frames.start, true);
        }
    }

    changeStep(e) {
        const value = Math.clamp(+e.target.value, +e.target.min, +e.target.max);
        e.target.value = value;
        this._model.multipleStep = value;
    }

    changeFPS(e) {
        const fpsMap = {
            1: 1,
            2: 5,
            3: 12,
            4: 25,
            5: 50,
            6: 100,
        };
        const value = Math.clamp(+e.target.value, 1, 6);
        this._model.fps = fpsMap[value];
    }

    changeResetZoom(e) {
        this._model.resetZoom = e.target.checked;
    }

    play() {
        this._model.play();
    }

    pause() {
        this._model.pause();
    }

    next() {
        this._model.shift(1);
        this._model.pause();
    }

    previous() {
        this._model.shift(-1);
        this._model.pause();
    }

    first() {
        this._model.shift(this._model.frames.start, true);
        this._model.pause();
    }

    last() {
        this._model.shift(this._model.frames.stop, true);
        this._model.pause();
    }

    forward() {
        this._model.shift(this._model.multipleStep);
        this._model.pause();
    }

    backward() {
        this._model.shift(-this._model.multipleStep);
        this._model.pause();
    }

    seek(frame) {
        this._model.shift(frame, true);
    }

    rotate(angle) {
        Logger.addEvent(Logger.EventType.rotateImage);
        this._model.rotate(angle);
    }

    get rotateAll() {
        return this._model.rotateAll;
    }

    set rotateAll(value) {
        this._model.rotateAll = value;
    }
}


class PlayerView {
    constructor(playerModel, playerController) {
        this._controller = playerController;
        this._playerUI = $('#playerFrame');
        this._playerBackgroundUI = $('#frameBackground');
        this._playerContentUI = $('#frameContent');
        this._playerGridUI = $('#frameGrid');
        this._playerTextUI = $('#frameText');
        this._progressUI = $('#playerProgress');
        this._loadingUI = $('#frameLoadingAnim');
        this._playButtonUI = $('#playButton');
        this._pauseButtonUI = $('#pauseButton');
        this._nextButtonUI = $('#nextButton');
        this._prevButtonUI = $('#prevButton');
        this._multipleNextButtonUI = $('#multipleNextButton');
        this._multiplePrevButtonUI = $('#multiplePrevButton');
        this._firstButtonUI = $('#firstButton');
        this._lastButtonUI = $('#lastButton');
        this._playerStepUI = $('#playerStep');
        this._playerSpeedUI = $('#speedSelect');
        this._resetZoomUI = $('#resetZoomBox');
        this._frameNumber = $('#frameNumber');
        this._playerGridPattern = $('#playerGridPattern');
        this._playerGridPath = $('#playerGridPath');
        this._contextMenuUI = $('#playerContextMenu');
        this._clockwiseRotationButtonUI = $('#clockwiseRotation');
        this._counterClockwiseRotationButtonUI = $('#counterClockwiseRotation');
        this._rotationWrapperUI = $('#rotationWrapper');
        this._rotatateAllImagesUI = $('#rotateAllImages');

        this._clockwiseRotationButtonUI.on('click', () => {
            this._controller.rotate(90);
        });

        this._counterClockwiseRotationButtonUI.on('click', () => {
            this._controller.rotate(-90);
        });

        this._rotatateAllImagesUI.prop('checked', this._controller.rotateAll);
        this._rotatateAllImagesUI.on('change', (e) => {
            this._controller.rotateAll = e.target.checked;
        });

        $('*').on('mouseup.player', () => this._controller.frameMouseUp());
        this._playerContentUI.on('mousedown', (e) => {
            const pos = window.cvat.translate.point.clientToCanvas(this._playerBackgroundUI[0],
                e.clientX, e.clientY);
            const {
                frameWidth
            } = window.cvat.player.geometry;
            const {
                frameHeight
            } = window.cvat.player.geometry;
            if (pos.x >= 0 && pos.y >= 0 && pos.x <= frameWidth && pos.y <= frameHeight) {
                this._controller.frameMouseDown(e);
            }
            e.preventDefault();
        });

        this._playerContentUI.on('wheel', e => this._controller.zoom(e, this._playerBackgroundUI[0]));
        this._playerContentUI.on('dblclick', () => this._controller.fit());
        this._playerContentUI.on('mousemove', e => this._controller.frameMouseMove(e));
        this._progressUI.on('mousedown', e => this._controller.progressMouseDown(e));
        this._progressUI.on('mouseup', () => this._controller.progressMouseUp());
        this._progressUI.on('mousemove', e => this._controller.progressMouseMove(e));
        this._playButtonUI.on('click', () => this._controller.play());
        this._pauseButtonUI.on('click', () => this._controller.pause());
        this._nextButtonUI.on('click', () => this._controller.next());
        this._prevButtonUI.on('click', () => this._controller.previous());
        this._multipleNextButtonUI.on('click', () => this._controller.forward());
        this._multiplePrevButtonUI.on('click', () => this._controller.backward());
        this._firstButtonUI.on('click', () => this._controller.first());
        this._lastButtonUI.on('click', () => this._controller.last());
        this._playerSpeedUI.on('change', e => this._controller.changeFPS(e));
        this._resetZoomUI.on('change', e => this._controller.changeResetZoom(e));
        this._playerStepUI.on('change', e => this._controller.changeStep(e));
        this._frameNumber.on('change', (e) => {
            if (Number.isInteger(+e.target.value)) {
                this._controller.seek(+e.target.value);
                blurAllElements();
            }
        });

        const {
            shortkeys
        } = window.cvat.config;

        this._clockwiseRotationButtonUI.attr('title', `
            ${shortkeys.clockwise_rotation.view_value} - ${shortkeys.clockwise_rotation.description}`);
        this._counterClockwiseRotationButtonUI.attr('title', `
            ${shortkeys.counter_clockwise_rotation.view_value} - ${shortkeys.counter_clockwise_rotation.description}`);

        const playerGridOpacityInput = $('#playerGridOpacityInput');
        playerGridOpacityInput.on('input', (e) => {
            const value = Math.clamp(+e.target.value, +e.target.min, +e.target.max);
            e.target.value = value;
            this._playerGridPath.attr({
                opacity: value / +e.target.max,
            });
        });

        playerGridOpacityInput.attr('title', `
            ${shortkeys.change_grid_opacity.view_value} - ${shortkeys.change_grid_opacity.description}`);

        const playerGridStrokeInput = $('#playerGridStrokeInput');
        playerGridStrokeInput.on('change', (e) => {
            this._playerGridPath.attr({
                stroke: e.target.value,
            });
        });

        playerGridStrokeInput.attr('title', `
            ${shortkeys.change_grid_color.view_value} - ${shortkeys.change_grid_color.description}`);

        $('#playerGridSizeInput').on('change', (e) => {
            const value = Math.clamp(+e.target.value, +e.target.min, +e.target.max);
            e.target.value = value;
            this._playerGridPattern.attr({
                width: value,
                height: value,
            });
        });

        Mousetrap.bind(shortkeys.focus_to_frame.value, () => this._frameNumber.focus(), 'keydown');
        Mousetrap.bind(shortkeys.change_grid_opacity.value,
            Logger.shortkeyLogDecorator((e) => {
                const ui = playerGridOpacityInput;
                let value = +ui.prop('value');
                value += e.key === '=' ? 1 : -1;
                value = Math.clamp(value, 0, 5);
                ui.prop('value', value);
                this._playerGridPath.attr({
                    opacity: value / +ui.prop('max'),
                });
            }),
            'keydown');

        Mousetrap.bind(shortkeys.change_grid_color.value,
            Logger.shortkeyLogDecorator(() => {
                const ui = playerGridStrokeInput;
                const colors = [];
                for (const opt of ui.find('option')) {
                    colors.push(opt.value);
                }
                const idx = colors.indexOf(this._playerGridPath.attr('stroke')) + 1;
                const value = colors[idx] || colors[0];
                this._playerGridPath.attr('stroke', value);
                ui.prop('value', value);
            }),
            'keydown');

        this._progressUI['0'].max = playerModel.frames.stop - playerModel.frames.start;
        this._progressUI['0'].value = 0;

        this._resetZoomUI.prop('checked', playerModel.resetZoom);
        this._playerStepUI.prop('value', playerModel.multipleStep);
        this._playerSpeedUI.prop('value', '4');

        this._frameNumber.attr('title', `
            ${shortkeys.focus_to_frame.view_value} - ${shortkeys.focus_to_frame.description}`);

        this._nextButtonUI.find('polygon').append($(document.createElementNS('http://www.w3.org/2000/svg', 'title'))
            .html(`${shortkeys.next_frame.view_value} - ${shortkeys.next_frame.description}`));

        this._prevButtonUI.find('polygon').append($(document.createElementNS('http://www.w3.org/2000/svg', 'title'))
            .html(`${shortkeys.prev_frame.view_value} - ${shortkeys.prev_frame.description}`));

        this._playButtonUI.find('polygon').append($(document.createElementNS('http://www.w3.org/2000/svg', 'title'))
            .html(`${shortkeys.play_pause.view_value} - ${shortkeys.play_pause.description}`));

        this._pauseButtonUI.find('polygon').append($(document.createElementNS('http://www.w3.org/2000/svg', 'title'))
            .html(`${shortkeys.play_pause.view_value} - ${shortkeys.play_pause.description}`));

        this._multipleNextButtonUI.find('polygon').append($(document.createElementNS('http://www.w3.org/2000/svg', 'title'))
            .html(`${shortkeys.forward_frame.view_value} - ${shortkeys.forward_frame.description}`));

        this._multiplePrevButtonUI.find('polygon').append($(document.createElementNS('http://www.w3.org/2000/svg', 'title'))
            .html(`${shortkeys.backward_frame.view_value} - ${shortkeys.backward_frame.description}`));


        this._contextMenuUI.click((e) => {
            $('.custom-menu').hide(100);
            switch ($(e.target).attr('action')) {
            case 'job_url': {
                window.cvat.search.set('frame', null);
                window.cvat.search.set('filter', null);
                copyToClipboard(window.cvat.search.toString());
                break;
            }
            case 'frame_url': {
                window.cvat.search.set('frame', window.cvat.player.frames.current);
                window.cvat.search.set('filter', null);
                copyToClipboard(window.cvat.search.toString());
                window.cvat.search.set('frame', null);
                break;
            }
            default:
            }
        });

        this._playerUI.on('contextmenu.playerContextMenu', (e) => {
            if (!window.cvat.mode) {
                $('.custom-menu').hide(100);
                this._contextMenuUI.finish().show(100);
                const x = Math.min(e.pageX, this._playerUI[0].offsetWidth
                    - this._contextMenuUI[0].scrollWidth);
                const y = Math.min(e.pageY, this._playerUI[0].offsetHeight
                    - this._contextMenuUI[0].scrollHeight);
                this._contextMenuUI.offset({
                    left: x,
                    top: y,
                });
                e.preventDefault();
            }
        });

        this._playerContentUI.on('mousedown.playerContextMenu', () => {
            $('.custom-menu').hide(100);
        });

        playerModel.subscribe(this);
    }

    onPlayerUpdate(model) {
        const {
            image
        } = model;
        const {
            frames
        } = model;
        const {
            geometry
        } = model;

        if (!image) {
            this._loadingUI.removeClass('hidden');
            this._playerBackgroundUI.css('background-image', '');
            return;
        }

        this._loadingUI.addClass('hidden');
        if (this._playerBackgroundUI.css('background-image').slice(5, -2) !== image.src) {
            this._playerBackgroundUI.css('background-image', `url("${image.src}")`);
        }

        if (model.playing) {
            this._playButtonUI.addClass('hidden');
            this._pauseButtonUI.removeClass('hidden');
        } else {
            this._pauseButtonUI.addClass('hidden');
            this._playButtonUI.removeClass('hidden');
        }

        if (frames.current === frames.start) {
            this._firstButtonUI.addClass('disabledPlayerButton');
            this._prevButtonUI.addClass('disabledPlayerButton');
            this._multiplePrevButtonUI.addClass('disabledPlayerButton');
        } else {
            this._firstButtonUI.removeClass('disabledPlayerButton');
            this._prevButtonUI.removeClass('disabledPlayerButton');
            this._multiplePrevButtonUI.removeClass('disabledPlayerButton');
        }

        if (frames.current === frames.stop) {
            this._lastButtonUI.addClass('disabledPlayerButton');
            this._nextButtonUI.addClass('disabledPlayerButton');
            this._playButtonUI.addClass('disabledPlayerButton');
            this._multipleNextButtonUI.addClass('disabledPlayerButton');
        } else {
            this._lastButtonUI.removeClass('disabledPlayerButton');
            this._nextButtonUI.removeClass('disabledPlayerButton');
            this._playButtonUI.removeClass('disabledPlayerButton');
            this._multipleNextButtonUI.removeClass('disabledPlayerButton');
        }

        this._progressUI['0'].value = frames.current - frames.start;

        this._rotationWrapperUI.css('transform', `rotate(${geometry.rotation}deg)`);

        for (const obj of [this._playerBackgroundUI, this._playerGridUI]) {
            obj.css('width', image.width);
            obj.css('height', image.height);
            obj.css('top', geometry.top);
            obj.css('left', geometry.left);
            obj.css('transform', `scale(${geometry.scale})`);
        }

        for (const obj of [this._playerContentUI, this._playerTextUI]) {
            obj.css('width', image.width + geometry.frameOffset * 2);
            obj.css('height', image.height + geometry.frameOffset * 2);
            obj.css('top', geometry.top - geometry.frameOffset * geometry.scale);
            obj.css('left', geometry.left - geometry.frameOffset * geometry.scale);
        }

        this._playerContentUI.css('transform', `scale(${geometry.scale})`);
        this._playerTextUI.css('transform', `scale(10) rotate(${-geometry.rotation}deg)`);
        this._playerGridPath.attr('stroke-width', 2 / geometry.scale);
        this._frameNumber.prop('value', frames.current);
    }
}
