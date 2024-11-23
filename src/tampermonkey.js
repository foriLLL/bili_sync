// ==UserScript==
// @name         Bilibili Video Sync
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  同步 Bilibili 视频播放
// @match        https://www.bilibili.com/video/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';
    let beingUpdating = false;

    let checkVideoInterval = setInterval(() => {
        const video = document.querySelector('#bilibili-player video');
        if (video) {
            clearInterval(checkVideoInterval);
            console.log("开始同步");
            initSync(video);
        }
    }, 500);

    function initSync(video) {
        const sessionId = prompt('请输入会话ID，用于同步播放：', 'default-session-id');
        const socket = new WebSocket('wss://foril.space:2333');

        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ type: 'join', sessionId }));
        });

        socket.addEventListener('message', (event) => {
            const state = JSON.parse(event.data);
            console.log("收到状态", state);
            beingUpdating = true;
            // 防止重复设置导致事件循环
            if (Math.abs(video.currentTime - state.currentTime) > 0.5) {
                video.currentTime = state.currentTime;
            }
            if (video.playbackRate !== state.playbackRate) {
                video.playbackRate = state.playbackRate;
            }
            if (state.isPaused && !video.paused) {
                video.pause();
            } else if (!state.isPaused && video.paused) {
                video.play();
            }
            setTimeout(()=>{beingUpdating = false}, 0);
        });

        function sendVideoState() {
            if (beingUpdating == true) return;
            console.log("发送状态");
            const state = {
                currentTime: video.currentTime,
                isPaused: video.paused,
                playbackRate: video.playbackRate,
            };
            socket.send(JSON.stringify({ type: 'update', sessionId, state }));
        }

        video.addEventListener('play', sendVideoState);
        video.addEventListener('pause', sendVideoState);
        video.addEventListener('seeked', sendVideoState);
        video.addEventListener('ratechange', sendVideoState);

        window.addEventListener('beforeunload', () => {
            socket.send(JSON.stringify({ type: 'leave', sessionId }));
            socket.close();
        });
    }
})();