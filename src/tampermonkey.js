// ==UserScript==
// @name         Bilibili Video Sync
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  同步 Bilibili 视频播放和页面跳转
// @noframes
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    let socket;
    let sessionId = prompt('请输入会话ID，用于同步播放：', 'default-session-id');
    let video;
    let beingUpdating = false;

    // 初始化 WebSocket 连接
    function initSocket() {
        socket = new WebSocket('ws://localhost:2333');

        socket.addEventListener('open', () => {
            console.log("WebSocket 连接成功");
            socket.send(JSON.stringify({ type: 'join', sessionId }));
        });

        socket.addEventListener('message', (event) => {
            const state = JSON.parse(event.data);
            console.log("收到数据", state);
            syncState(state);
        });

        socket.addEventListener('close', () => {
            console.log("WebSocket 连接已关闭");
        });

        socket.addEventListener('error', (error) => {
            console.error("WebSocket 错误", error);
        });
    }

    // 获取不带查询参数的 URL
    function getUrlWithoutQuery(url) {
        let a = document.createElement('a');
        a.href = url;
        return a.protocol + '//' + a.host + a.pathname;
    }

    // 检查并初始化视频同步
    function initVideoSync() {
        checkVideo(() => {
            console.log("初始化视频同步");
            function sendVideoState() {
                if (beingUpdating) {
                    console.log('更新中，不触发 send');
                    return;
                }
                const state = {
                    currentTime: video.currentTime,
                    isPaused: video.paused,
                    playbackRate: video.playbackRate,
                    timestamp: new Date().getTime()
                    // url: getUrlWithoutQuery(window.location.href),
                };
                console.log("更新并发送状态：", state);
                socket.send(JSON.stringify({ type: 'update', sessionId, state }));
            }

            video.addEventListener('play', sendVideoState);
            video.addEventListener('pause', sendVideoState);
            video.addEventListener('seeking', sendVideoState);
            video.addEventListener('ratechange', sendVideoState);
            // window.addEventListener('popstate', sendVideoState);
        });
    }

    // 检查视频元素是否存在
    function checkVideo(callback) {
        let checkVideoInterval = setInterval(() => {
            video = document.querySelector('#bilibili-player video');
            if (video) {
                clearInterval(checkVideoInterval);
                console.log("找到视频元素");
                callback();
            } else {
                console.log("未找到视频元素，等待...");
            }
        }, 500);
    }

    function syncState(state) {
        if (!video) {
            console.log("未找到视频元素，无法同步状态");
            return;
        }
        if (beingUpdating) {
            console.log('更新失败，正在更新中');
            return;
        }

        function updateVideoState(state) {
            beingUpdating = true;
            console.log('beingUpdating 置为 true');
            // 计算正确事件
            let diff = (new Date().getTime() - state.timestamp) / 1000;
            console.log(`相差 ${diff} 秒`);
            state.currentTime += diff;
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
            setTimeout(() => {
                beingUpdating = false;
                console.log('beingUpdating 置为 false');
            }, 0);
        };

        // 防止重复设置导致事件循环
        updateVideoState(state);
    }

    // 页面卸载时处理
    window.addEventListener('beforeunload', () => {
        socket.send(JSON.stringify({ type: 'leave', sessionId }));
        socket.close();
    });

    // 初始化
    initSocket();
    // monitorUrlChange();
    initVideoSync();
})();