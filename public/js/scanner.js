window.barcodeScanner = (() => {
    let controls = null;
    let activeVideo = null;

    async function start(videoEl, onResult, onError) {
        stop();
        if (!window.ZXingBrowser) {
            onError && onError(new Error('Библиотека сканера не загрузилась'));
            return;
        }
        const reader = new ZXingBrowser.BrowserMultiFormatReader();
        try {
            const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
            // Prefer rear camera if available
            let deviceId = undefined;
            const rear = devices.find(d => /back|rear|environment/i.test(d.label));
            if (rear) deviceId = rear.deviceId;

            activeVideo = videoEl;
            controls = await reader.decodeFromVideoDevice(deviceId, videoEl, (result, err) => {
                if (result) onResult(result.getText());
            });
        } catch (err) {
            // Fallback to default camera with constraints
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' } },
                    audio: false,
                });
                videoEl.srcObject = stream;
                await videoEl.play();
                activeVideo = videoEl;
                controls = await reader.decodeFromStream(stream, videoEl, (result) => {
                    if (result) onResult(result.getText());
                });
            } catch (err2) {
                onError && onError(err2);
            }
        }
    }

    function stop() {
        if (controls) {
            try { controls.stop(); } catch {}
            controls = null;
        }
        if (activeVideo && activeVideo.srcObject) {
            const tracks = activeVideo.srcObject.getTracks ? activeVideo.srcObject.getTracks() : [];
            tracks.forEach(t => t.stop());
            activeVideo.srcObject = null;
        }
        activeVideo = null;
    }

    return { start, stop };
})();
