// videogen 渲染引擎(从 go-music-dl 经典页 videogen.js 提取移植)。
// 原为独立 render.html 窗口里运行的渲染逻辑(window.isRenderWorker 分支),
// 这里改造成 ES module:DOM 状态依赖换成 callbacks,canvas 渲染逻辑原样保留。
// eslint-disable 整体关闭(移植代码,保持与原实现一致便于对照/回溯)。
/* eslint-disable */

// ===== FFT 频谱算法(纯算法,自包含)=====
    const FFT = {
        windowed: null, mags: null, previousMags: null,
        reset: function() { this.previousMags = null; },
        fft: function(data) {
            const n = data.length;
            if (n <= 1) return data;
            const half = n / 2, even = new Float32Array(half), odd = new Float32Array(half);
            for (let i = 0; i < half; i++) { even[i] = data[2 * i]; odd[i] = data[2 * i + 1]; }
            const q = this.fft(even), r = this.fft(odd), output = new Float32Array(n);
            for (let k = 0; k < half; k++) { const t = r[k]; output[k] = q[k] + t; output[k + half] = q[k] - t; }
            return output;
        },
        getFrequencyData: function(pcmData, fftSize, smoothing) {
            const half = fftSize / 2;
            if (!this.windowed || this.windowed.length !== fftSize) {
                this.windowed = new Float32Array(fftSize);
                this.mags = new Uint8Array(half);
                this.previousMags = new Float32Array(half);
            }
            for(let i=0; i<fftSize; i++) {
                const val = (i < pcmData.length) ? pcmData[i] : 0;
                this.windowed[i] = val * (0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1))));
            }
            const rawFFT = this.fft(this.windowed);
            for(let i=0; i<half; i++) {
                let mag = Math.abs(rawFFT[i]) / fftSize;
                mag = mag * 2.0;
                mag = smoothing * this.previousMags[i] + (1 - smoothing) * mag;
                this.previousMags[i] = mag;
                let db = 20 * Math.log10(mag + 1e-6);
                const minDb = -100, maxDb = -10;
                let val = (db - minDb) * (255 / (maxDb - minDb));
                if(val < 0) val = 0; if(val > 255) val = 255;
                this.mags[i] = val;
            }
            return this.mags;
        }
    };

    function processVisualizerBars(freqData) {
        const barsCount = 180, barHeights = [];
        const maxIdx = Math.floor(freqData.length * 0.8), minIdx = 1; 
        for(let i=0; i<barsCount; i++) {
            const logRange = Math.log(maxIdx / minIdx);
            const idx = minIdx * Math.exp(logRange * (i / barsCount));
            const lower = Math.floor(idx), upper = Math.ceil(idx), frac = idx - lower;
            let val = (freqData[lower] || 0) * (1 - frac) + (freqData[upper] || 0) * frac;
            val *= 1 + (i / barsCount) * 0.8;
            if (val > 255) val = 255;
            let h = 2; 
            if (val > 0) h += Math.pow(val / 255.0, 2.5) * 40; 
            barHeights.push(h);
        }
        return { heights: barHeights };
    }

    function drawVisualizerRings(ctx, cx, cy, radius, heights) {
        ctx.save(); ctx.translate(cx, cy);
        const barsCount = heights.length, barWidth = 1.5, halfWidth = barWidth / 2;
        for (let i = 0; i < barsCount; i++) {
            ctx.save();
            ctx.rotate((Math.PI * 2 / barsCount) * i - Math.PI / 2);
            const h = heights[i] || 2, hue = (i / barsCount) * 360; 
            ctx.fillStyle = `hsla(${hue}, 100%, 65%, 0.9)`;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(-halfWidth, -radius - h, barWidth, h, 0.5);
            else ctx.rect(-halfWidth, -radius - h, barWidth, h);
            ctx.fill(); ctx.restore(); 
        }
        ctx.restore(); 
    }

    // =================================================================
    // 独立新窗口渲染线程 (Worker 环境)
    // =================================================================

// ===== 歌词处理 worker 函数(纯函数)=====
        const fallbackLineDurationWorker = 1200;

        function lyricProgressWorker(nowMs, start, end) {
            if (nowMs <= start) return 0;
            if (!Number.isFinite(end) || end <= start) return 1;
            return Math.max(0, Math.min(1, (nowMs - start) / (end - start)));
        }

        function normalizeGroupWordsWorker(sourceWords, groupStart, groupEnd, fallbackText) {
            const words = Array.isArray(sourceWords) && sourceWords.length > 0
                ? sourceWords
                : [{ text: fallbackText || '', start: groupStart, end: groupEnd }];
            return words.map((word, index) => {
                const start = Number(word?.start);
                const nextStart = index + 1 < words.length ? Number(words[index + 1]?.start) : NaN;
                let end = Number(word?.end);
                const safeStart = Number.isFinite(start) ? start : groupStart;
                if (!Number.isFinite(end) || end <= safeStart) {
                    end = Number.isFinite(nextStart) && nextStart > safeStart ? nextStart : groupEnd;
                }
                return {
                    text: String(word?.text || ''),
                    start: safeStart,
                    end
                };
            }).filter(word => word.text !== '');
        }

        function normalizeLyricGroupsWorker(rawGroups) {
            return (rawGroups || []).map((group, index, list) => {
                const start = Number(group?.start || 0);
                const nextStart = index + 1 < list.length ? Number(list[index + 1]?.start || 0) : 0;
                const end = nextStart > start ? nextStart : start + fallbackLineDurationWorker;
                const lines = (group?.lines || []).map((line) => ({
                    ...line,
                    text: String(line?.text || ''),
                    words: normalizeGroupWordsWorker(line?.words, start, end, line?.text)
                }));
                return { start, end, time: start / 1000, lines };
            }).filter(group => group.lines.some(line => line.text));
        }

        function looksLikeRomajiLineWorker(line) {
            const text = String(line?.text || '').trim();
            if (!text) return false;
            const latinCount = (text.match(/[A-Za-z]/g) || []).length;
            const cjkOrKanaCount = (text.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
            return latinCount > 0 && latinCount >= cjkOrKanaCount;
        }

        function splitLyricGroupLinesWorker(lines) {
            const [orig, ...extras] = lines || [];
            let roma = null;
            let trans = null;
            extras.forEach((line) => {
                if (!roma && looksLikeRomajiLineWorker(line)) {
                    roma = line;
                    return;
                }
                if (!trans) {
                    trans = line;
                    return;
                }
                if (!roma) {
                    roma = line;
                }
            });
            return { orig, roma, trans };
        }

        function wrapPlainTextWorker(ctx, text, maxW) {
            const lines = [];
            let currentLine = '';
            const chars = Array.from(String(text || ''));
            for (let i = 0; i < chars.length; i++) {
                const next = currentLine + chars[i];
                if (ctx.measureText(next).width > maxW && currentLine.length > 0) {
                    if (/[a-zA-Z]/.test(chars[i]) && currentLine.includes(' ')) {
                        const lastSpace = currentLine.lastIndexOf(' ');
                        lines.push(currentLine.substring(0, lastSpace));
                        currentLine = currentLine.substring(lastSpace + 1) + chars[i];
                    } else {
                        lines.push(currentLine);
                        currentLine = chars[i];
                    }
                } else {
                    currentLine = next;
                }
            }
            if (currentLine) lines.push(currentLine);
            return lines;
        }

        function wrapWordSegmentsWorker(ctx, words, maxW) {
            const lines = [];
            let currentLine = [];
            let currentWidth = 0;
            words.forEach((word) => {
                const width = ctx.measureText(word.text || '').width;
                if (currentLine.length > 0 && currentWidth + width > maxW) {
                    lines.push(currentLine);
                    currentLine = [];
                    currentWidth = 0;
                }
                currentLine.push(word);
                currentWidth += width;
            });
            if (currentLine.length > 0) lines.push(currentLine);
            return lines;
        }

        function createLineOnlyGroupsWorker(lyricRaw) {
            return normalizeLyricGroupsWorker((lyricRaw || []).map((item) => ({
                start: Math.round((Number(item?.time) || 0) * 1000),
                lines: [{ text: String(item?.text || ''), words: [] }]
            })));
        }


// ===== 核心渲染流程 =====
// callbacks: { onProgress(title,desc,pct), getPreviewCanvas()->canvas, onComplete(url), onError(msg) }
export async function runOfflineRender(data, callbacks = {}) {
            const apiRoot = data.apiRoot;
            const previewCanvas = callbacks.getPreviewCanvas ? callbacks.getPreviewCanvas() : null;

            const setStatus = (title, desc, pct) => {
                if (callbacks.onProgress) callbacks.onProgress(title, desc, pct);
            };

            try {
                let initRes;
                let audioBuffer;
                const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

                if (data.customAudioFile) {
                    setStatus("正在初始化...", "正在向服务器投递您的本地音乐...", 5);
                    const fd = new FormData();
                    fd.append("id", data.id);
                    fd.append("source", data.source);
                    fd.append("audio_file", data.customAudioFile);

                    initRes = await fetch(`${apiRoot}/videogen/init`, {
                        method: "POST",
                        body: fd
                    }).then(r => r.json());
                    if (initRes.error) throw new Error(initRes.error);

                    setStatus("解码音频...", "解析本地高清音频数据...", 15);
                    const arr = await data.customAudioFile.arrayBuffer();
                    audioBuffer = await audioCtx.decodeAudioData(arr);
                } else {
                    setStatus("正在初始化...", "下载音频与初始化并行中...", 5);
                    const audioDownloadUrl = `${apiRoot}/download?id=${encodeURIComponent(data.id)}&source=${encodeURIComponent(data.source)}`;
                    const [initResult, audioArr] = await Promise.all([
                        fetch(`${apiRoot}/videogen/init`, {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: data.id, source: data.source }),
                        }).then(r => r.json()),
                        fetch(audioDownloadUrl).then(r => r.arrayBuffer())
                    ]);
                    initRes = initResult;
                    if (initRes.error) throw new Error(initRes.error);

                    setStatus("解码音频...", "解析音频数据...", 15);
                    audioBuffer = await audioCtx.decodeAudioData(audioArr);
                }
                    
                setStatus("加载视觉资源...", "准备 1080P 超清渲染画板", 25);
                
                const logicalW = 1280, logicalH = 720, scaleFactor = 1.5; 
                const width = logicalW * scaleFactor, height = logicalH * scaleFactor;
                
                const canvas = document.createElement("canvas");
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext("2d");
                
                if (previewCanvas) { previewCanvas.width = width; previewCanvas.height = height; }
                const previewCtx = previewCanvas ? previewCanvas.getContext("2d") : null;

                let bgMedia = null;
                if (data.isVideoBg) {
                    bgMedia = document.createElement("video");
                    bgMedia.src = data.rawCover; bgMedia.muted = true; bgMedia.loop = true;
                    bgMedia.setAttribute('playsinline', ''); 
                    await bgMedia.play(); bgMedia.pause(); 
                } else {
                    bgMedia = new Image(); bgMedia.crossOrigin = "Anonymous";
                    let coverSrc = data.rawCover;
                    if (!data.rawCover.startsWith("data:")) coverSrc = `${apiRoot}/download_cover?url=${encodeURIComponent(data.rawCover)}&name=render&artist=render`;
                    await Promise.race([
                        new Promise(r => { bgMedia.onload = r; bgMedia.onerror = () => { bgMedia.src = "https://via.placeholder.com/600"; setTimeout(r, 1000); }; bgMedia.src = coverSrc; }),
                        new Promise((_, r) => setTimeout(() => r(new Error("资源加载超时")), 15000))
                    ]);
                }
                
                const fps = 30;
                const duration = audioBuffer.duration;
                const totalFrames = Math.floor(duration * fps);
                const rawData = audioBuffer.getChannelData(0);
                const samplesPerFrame = Math.floor(audioBuffer.sampleRate / fps);
                const batchSize = 30; 
                const lyricGroups = Array.isArray(data.lyricGroups) && data.lyricGroups.length > 0
                    ? normalizeLyricGroupsWorker(data.lyricGroups)
                    : createLineOnlyGroupsWorker(data.lyricRaw);
                const renderKaraoke = data.lyricMode === 'karaoke' && lyricGroups.length > 0;
                 
                FFT.reset();
                setStatus("超清渲染中", "0%", 30);
                
                const canvasToJpegBlob = (targetCanvas, quality) => new Promise((resolve, reject) => {
                    if (targetCanvas.toBlob) {
                        targetCanvas.toBlob((blob) => {
                            if (blob) resolve(blob);
                            else reject(new Error("Frame encode failed"));
                        }, "image/jpeg", quality);
                        return;
                    }

                    try {
                        const dataUrl = targetCanvas.toDataURL("image/jpeg", quality);
                        const payload = dataUrl.split(",")[1] || "";
                        const binary = atob(payload);
                        const bytes = new Uint8Array(binary.length);
                        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                        resolve(new Blob([bytes], { type: "image/jpeg" }));
                    } catch (err) {
                        reject(err);
                    }
                });

                const uploadBatch = async (frames, startIdx) => {
                    const form = new FormData();
                    form.append("session_id", initRes.session_id);
                    form.append("start_idx", String(startIdx));
                    frames.forEach((blob, index) => {
                        const frameNum = String(startIdx + index).padStart(5, "0");
                        form.append("frames", blob, `frame_${frameNum}.jpg`);
                    });

                    const res = await fetch(`${apiRoot}/videogen/frame`, {
                        method: "POST",
                        body: form
                    });
                    const body = await res.json().catch(() => ({}));
                    if (!res.ok || body.error) {
                        throw new Error(body.error || `Frame upload failed: ${res.status}`);
                    }
                };
                
                const seekVideo = async (time) => {
                    if (!data.isVideoBg || !bgMedia.duration) return;
                    const tt = time % bgMedia.duration;
                    bgMedia.currentTime = tt;
                    if (Math.abs(bgMedia.currentTime - tt) < 0.1 && bgMedia.readyState >= 3) return;
                    await new Promise(r => {
                        const onSeeked = () => { bgMedia.removeEventListener('seeked', onSeeked); r(); };
                        setTimeout(() => { bgMedia.removeEventListener('seeked', onSeeked); r(); }, 500); 
                        bgMedia.addEventListener('seeked', onSeeked);
                    });
                };

                const drawWrappedLines = (lines, x, startY, lineHeight, color, alpha) => {
                    ctx.fillStyle = color;
                    let y = startY + lineHeight / 2;
                    for (const lineText of lines) {
                        ctx.globalAlpha = alpha;
                        ctx.fillText(lineText, x, y);
                        y += lineHeight;
                    }
                    ctx.globalAlpha = 1;
                    return startY + (lines.length * lineHeight);
                };

                const karaokeTextColor = "#ffffff";
                const karaokeAccentColor = "#12bd85";
                const karaokeStrokeText = (text, x, y, lineHeight, fillColor, strokeColor, alpha) => {
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.lineJoin = "round";
                    ctx.lineWidth = Math.max(2, lineHeight * 0.08);
                    ctx.strokeStyle = strokeColor;
                    ctx.fillStyle = fillColor;
                    ctx.strokeText(text, x, y);
                    ctx.fillText(text, x, y);
                    ctx.restore();
                };

                const drawKaraokeWordLine = (words, x, y, lineHeight, nowMs, baseColor, fillColor, alpha) => {
                    ctx.lineJoin = "round"; // 确保边缘绝对圆润无尖刺
                    ctx.lineWidth = Math.max(3, lineHeight * 0.12); // 稍微加粗，还原图1厚实感
                    ctx.globalAlpha = alpha;
                    const strokeSpill = ctx.lineWidth; // 计算边框向外溢出的安全区距离

                    let cursorX = x;
                    
                    // 第1层：先画一整句的【底层绿边】
                    ctx.strokeStyle = karaokeAccentColor;
                    words.forEach((word) => {
                        const text = String(word?.text || '');
                        if (text) { ctx.strokeText(text, cursorX, y); cursorX += ctx.measureText(text).width; }
                    });

                    // 第2层：再画一整句的【底层白字】（字压在边上，内部绝对纯净无色块）
                    cursorX = x;
                    ctx.fillStyle = baseColor;
                    words.forEach((word) => {
                        const text = String(word?.text || '');
                        if (text) { ctx.fillText(text, cursorX, y); cursorX += ctx.measureText(text).width; }
                    });

                    // 高级裁剪层：精确切出当前的进度光束
                    ctx.save();
                    ctx.beginPath();
                    cursorX = x;
                    words.forEach((word) => {
                        const text = String(word?.text || '');
                        if (!text) return;
                        const width = ctx.measureText(text).width;
                        const progress = lyricProgressWorker(nowMs, Number(word.start || 0), Number(word.end || 0));
                        
                        if (progress > 0) {
                            // 核心修复：100%时刻意放宽右侧裁剪区，且向左延伸防止切掉首字描边
                            const clipRight = progress === 1 ? width + strokeSpill : width * progress;
                            ctx.rect(cursorX - strokeSpill, y - lineHeight, strokeSpill + clipRight, lineHeight * 2);
                        }
                        cursorX += width;
                    });
                    ctx.clip();

                    // 第3层：在进度裁剪区内画【高亮白边】
                    cursorX = x;
                    ctx.strokeStyle = karaokeTextColor;
                    words.forEach((word) => {
                        const text = String(word?.text || '');
                        if (text) { ctx.strokeText(text, cursorX, y); cursorX += ctx.measureText(text).width; }
                    });

                    // 第4层：在进度裁剪区内画【高亮绿字】
                    cursorX = x;
                    ctx.fillStyle = fillColor;
                    words.forEach((word) => {
                        const text = String(word?.text || '');
                        if (text) { ctx.fillText(text, cursorX, y); cursorX += ctx.measureText(text).width; }
                    });

                    ctx.restore();
                    ctx.globalAlpha = 1;
                };

                const drawLineLyrics = (time, lx, baseLy, maxWidth, gap) => {
                    let activeIdx = -1;
                    for (let i = 0; i < data.lyricRaw.length; i++) {
                        if (time >= data.lyricRaw[i].time) activeIdx = i;
                        else break;
                    }
                    if (activeIdx === -1) return;

                    let lyricsBlocks = [];
                    let activeBlockIndex = -1;
                    for (let offset = -4; offset <= 4; offset++) {
                        const idx = activeIdx + offset;
                        if (idx >= 0 && idx < data.lyricRaw.length) {
                            const isCurrent = offset === 0;
                            ctx.font = isCurrent ? "bold 36px sans-serif" : "600 26px sans-serif";
                            const lineHeight = isCurrent ? 48 : 34;
                            const textLines = wrapPlainTextWorker(ctx, data.lyricRaw[idx].text, maxWidth);
                            const blockHeight = (textLines.length - 1) * lineHeight;

                            lyricsBlocks.push({
                                textLines,
                                isCurrent,
                                lineHeight,
                                blockHeight,
                                font: ctx.font,
                                color: isCurrent ? "#ffffff" : "rgba(255,255,255,0.85)",
                                shadowBlur: isCurrent ? 6 : 4,
                                shadowOffset: isCurrent ? 2 : 1
                            });
                            if (isCurrent) activeBlockIndex = lyricsBlocks.length - 1;
                        }
                    }

                    if (activeBlockIndex === -1) return;
                    const activeBlock = lyricsBlocks[activeBlockIndex];
                    activeBlock.startY = baseLy - (activeBlock.blockHeight / 2);
                    for (let i = activeBlockIndex + 1; i < lyricsBlocks.length; i++) {
                        const prev = lyricsBlocks[i - 1];
                        lyricsBlocks[i].startY = prev.startY + prev.blockHeight + gap + (prev.lineHeight / 2) + (lyricsBlocks[i].lineHeight / 2);
                    }
                    for (let i = activeBlockIndex - 1; i >= 0; i--) {
                        const next = lyricsBlocks[i + 1];
                        lyricsBlocks[i].startY = next.startY - lyricsBlocks[i].blockHeight - gap - (next.lineHeight / 2) - (lyricsBlocks[i].lineHeight / 2);
                    }

                    for (const block of lyricsBlocks) {
                        ctx.font = block.font;
                        ctx.fillStyle = block.color;
                        ctx.shadowColor = "rgba(0,0,0,0.9)";
                        ctx.shadowBlur = block.shadowBlur;
                        ctx.shadowOffsetX = block.shadowOffset;
                        ctx.shadowOffsetY = block.shadowOffset;
                        let lineY = block.startY;
                        for (const lineText of block.textLines) {
                            let alpha = 1;
                            const dist = Math.abs(lineY - baseLy);
                            if (dist > 230) alpha = Math.max(0, 1 - (dist - 230) / 70);
                            if (alpha > 0) {
                                ctx.globalAlpha = alpha;
                                ctx.fillText(lineText, lx, lineY);
                                ctx.globalAlpha = 1;
                            }
                            lineY += block.lineHeight;
                        }
                    }
                };

                const drawKaraokeLyrics = (timeMs, lx, baseLy, maxWidth) => {
                    const karaokeFillColor = karaokeAccentColor;
                    const createLineLayout = (line, font, lineHeight, useWordProgress) => {
                        if (!line?.text) {
                            return { useWordProgress: false, wordLines: [], textLines: [], lineHeight, height: 0 };
                        }
                        ctx.font = font;
                        if (useWordProgress && Array.isArray(line.words) && line.words.length > 0) {
                            const wordLines = wrapWordSegmentsWorker(ctx, line.words, maxWidth);
                            const textLines = wordLines.map((lineWords) => lineWords.map((word) => word.text).join(''));
                            return {
                                useWordProgress: true,
                                wordLines,
                                textLines,
                                lineHeight,
                                height: textLines.length * lineHeight
                            };
                        }
                        const textLines = wrapPlainTextWorker(ctx, line.text, maxWidth);
                        return {
                            useWordProgress: false,
                            wordLines: [],
                            textLines,
                            lineHeight,
                            height: textLines.length * lineHeight
                        };
                    };
                    const drawLineLayout = (layout, x, startY, font, now, baseColor, alpha, isCurrent) => {
                        if (!layout || layout.textLines.length === 0) return startY;
                        ctx.font = font;
                        if (layout.useWordProgress && isCurrent) {
                            layout.wordLines.forEach((lineWords, lineIndex) => {
                                const y = startY + (lineIndex * layout.lineHeight) + layout.lineHeight / 2;
                                drawKaraokeWordLine(lineWords, x, y, layout.lineHeight, now, baseColor, karaokeFillColor, alpha);
                            });
                        } else {
                            layout.textLines.forEach((lineText, lineIndex) => {
                                const y = startY + (lineIndex * layout.lineHeight) + layout.lineHeight / 2;
                                karaokeStrokeText(lineText, x, y, layout.lineHeight, baseColor, karaokeAccentColor, alpha);
                            });
                        }
                        return startY + layout.height;
                    };
                    let activeIdx = -1;
                    for (let i = 0; i < lyricGroups.length; i++) {
                        if (timeMs >= lyricGroups[i].start) activeIdx = i;
                        else break;
                    }
                    if (activeIdx === -1) return;

                    const blocks = [];
                    let currentBlockIndex = -1;
                    for (let offset = -2; offset <= 2; offset++) {
                        const idx = activeIdx + offset;
                        if (idx < 0 || idx >= lyricGroups.length) continue;

                        const group = lyricGroups[idx];
                        const { orig, roma, trans } = splitLyricGroupLinesWorker(group.lines);
                        if (!orig) continue;

                        const isCurrent = offset === 0;
                        const blockAlpha = isCurrent ? 1 : 0.72;
                        const origFont = isCurrent ? "bold 40px sans-serif" : "700 28px sans-serif";
                        const origLineHeight = isCurrent ? 52 : 38;
                        const subGap = isCurrent ? 10 : 8;
                        const transFont = isCurrent ? "600 24px sans-serif" : "500 18px sans-serif";
                        const transLineHeight = isCurrent ? 30 : 22;
                        const romaFont = isCurrent ? "500 20px sans-serif" : "500 16px sans-serif";
                        const romaLineHeight = isCurrent ? 26 : 20;

                        const origLayout = createLineLayout(orig, origFont, origLineHeight, true);
                        const romaLayout = createLineLayout(roma, romaFont, romaLineHeight, !!roma?.verbatim);
                        const transLayout = createLineLayout(trans, transFont, transLineHeight, !!trans?.verbatim);

                        const blockHeight =
                            origLayout.height +
                            (romaLayout.height > 0 ? (subGap + romaLayout.height) : 0) +
                            (transLayout.height > 0 ? (subGap + transLayout.height) : 0);

                        blocks.push({
                            isCurrent,
                            alpha: blockAlpha,
                            origFont,
                            origLayout,
                            transFont,
                            transLayout,
                            romaFont,
                            romaLayout,
                            blockHeight,
                            subGap
                        });
                        if (isCurrent) currentBlockIndex = blocks.length - 1;
                    }

                    if (currentBlockIndex === -1) return;
                    const blockGap = 28;
                    blocks[currentBlockIndex].topY = baseLy - (blocks[currentBlockIndex].blockHeight / 2);
                    for (let i = currentBlockIndex + 1; i < blocks.length; i++) {
                        const prev = blocks[i - 1];
                        blocks[i].topY = prev.topY + prev.blockHeight + blockGap;
                    }
                    for (let i = currentBlockIndex - 1; i >= 0; i--) {
                        const next = blocks[i + 1];
                        blocks[i].topY = next.topY - blocks[i].blockHeight - blockGap;
                    }

                    blocks.forEach((block) => {
                        ctx.shadowColor = "rgba(0,0,0,0.9)";
                        ctx.shadowBlur = block.isCurrent ? 8 : 6;
                        ctx.shadowOffsetX = 2;
                        ctx.shadowOffsetY = 2;

                        let currentY = block.topY;

                        currentY = drawLineLayout(
                            block.origLayout,
                            lx,
                            currentY,
                            block.origFont,
                            timeMs,
                            karaokeTextColor,
                            block.alpha,
                            block.isCurrent
                        );

                        if (block.romaLayout.height > 0) {
                            currentY += block.subGap;
                            currentY = drawLineLayout(
                                block.romaLayout,
                                lx,
                                currentY,
                                block.romaFont,
                                timeMs,
                                karaokeTextColor,
                                block.alpha,
                                block.isCurrent
                            );
                        }

                        if (block.transLayout.height > 0) {
                            currentY += block.subGap;
                            drawLineLayout(
                                block.transLayout,
                                lx,
                                currentY,
                                block.transFont,
                                timeMs,
                                karaokeTextColor,
                                block.alpha,
                                block.isCurrent
                            );
                        }
                    });
                };
                 
                const drawFrame = async (frameIdx) => {
                    const time = frameIdx / fps;
                    if (data.isVideoBg) await seekVideo(time);
          
                    const fftSize = 2048; 
                    const startSample = Math.max(0, Math.floor((frameIdx * samplesPerFrame) - (fftSize / 4))); 
                    
                    let pcmSlice = rawData.subarray(startSample, startSample + fftSize);
                    if (pcmSlice.length < fftSize) {
                        const padded = new Float32Array(fftSize);
                        padded.set(pcmSlice); pcmSlice = padded;
                    }
                    
                    const freqData = FFT.getFrequencyData(pcmSlice, fftSize, 0.65);
                    const visResult = processVisualizerBars(freqData);
          
                    ctx.clearRect(0, 0, width, height); 
                    ctx.save(); ctx.scale(scaleFactor, scaleFactor);
                    
                    let mw = data.isVideoBg ? bgMedia.videoWidth : bgMedia.width;
                    let mh = data.isVideoBg ? bgMedia.videoHeight : bgMedia.height;
                    if (!mw) mw = logicalW; if (!mh) mh = logicalH; 
          
                    const baseRatio = Math.max(logicalW / mw, logicalH / mh);
                    let imgScale = 1.0;
                    if (!data.isVideoBg) {
                        const cycle = 20, progress = (time % (cycle * 2)) / cycle, ease = progress < 1 ? progress : 2 - progress; 
                        imgScale = 1.0 + (ease * ease * (3 - 2 * ease) * 0.1);
                    }
                    
                    const finalRatio = baseRatio * imgScale;
                    const bgW = mw * finalRatio, bgH = mh * finalRatio;
                    const bgX = (logicalW - bgW) / 2, bgY = (logicalH - bgH) / 2;
                    
                    ctx.drawImage(bgMedia, bgX, bgY, bgW, bgH);
          
                    const cx = 320, cy = logicalH / 2, discRadius = 200, barBaseRadius = discRadius + 2; 
                    drawVisualizerRings(ctx, cx, cy, barBaseRadius, visResult.heights);
        
                    ctx.save(); ctx.translate(cx, cy);
                    ctx.beginPath(); ctx.arc(0, 0, discRadius, 0, Math.PI * 2); ctx.fillStyle = "#111"; ctx.fill();
                    ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.lineWidth = 4; ctx.stroke();
                    
                    const grad = ctx.createRadialGradient(0,0,discRadius*0.5, 0,0,discRadius);
                    grad.addColorStop(0, '#1a1a1a'); grad.addColorStop(0.5, '#222'); grad.addColorStop(1, '#111');
                    ctx.fillStyle = grad; ctx.fill();
          
                    ctx.save(); ctx.rotate(time * 0.4); ctx.beginPath(); ctx.arc(0, 0, coverRadius = discRadius * 0.65, 0, Math.PI * 2); ctx.clip(); 
                    ctx.drawImage(bgMedia, 0, 0, mw, mh, -coverRadius, -coverRadius, coverRadius * 2, coverRadius * 2); ctx.restore();
                    ctx.restore(); 
          
                    const lx = 600, baseLy = logicalH / 2, maxWidth = logicalW - lx - 40, gap = 20;
                    ctx.textAlign = "left";
                    ctx.textBaseline = "middle";
                    if (renderKaraoke) drawKaraokeLyrics(time * 1000, lx, baseLy, maxWidth);
                    else drawLineLyrics(time, lx, baseLy, maxWidth, gap);
                    
                    ctx.font = "bold 26px sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = "center";
                    ctx.shadowColor = "rgba(0,0,0,0.9)"; ctx.shadowBlur = 8;
                    ctx.fillText(data.name, cx, logicalH - 50);
                    ctx.font = "18px sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.9)";
                    ctx.fillText(data.artist, cx, logicalH - 20);
                    
                    ctx.restore(); 
                    
                    if (previewCtx && (frameIdx % 10 === 0 || frameIdx === totalFrames - 1)) {
                        previewCtx.clearRect(0,0,width,height);
                        previewCtx.drawImage(canvas, 0, 0);
                    }
                };
                
                let frameIdx = 0;
                let uploadPromise = Promise.resolve();
                const renderStartTime = performance.now();
                while (frameIdx < totalFrames) {
                  let framesBuffer = [];
                  const batchStartIdx = frameIdx;
                  for (let i = 0; i < batchSize && frameIdx < totalFrames; i++) {
                    await drawFrame(frameIdx);
                    framesBuffer.push(await canvasToJpegBlob(canvas, 0.92));
                    frameIdx++;
                  }
                  await uploadPromise;
                  uploadPromise = uploadBatch(framesBuffer, batchStartIdx);
                  const pct = Math.round((frameIdx / totalFrames) * 100);
                  const elapsed = (performance.now() - renderStartTime) / 1000;
                  const eta = frameIdx > 0 ? Math.round(elapsed / frameIdx * (totalFrames - frameIdx)) : 0;
                  const etaMin = Math.floor(eta / 60);
                  const etaSec = eta % 60;
                  const etaStr = etaMin > 0 ? `${etaMin}分${etaSec}秒` : `${etaSec}秒`;
                  setStatus("超清帧渲染中...", `已完成 ${pct}%  (${frameIdx}/${totalFrames} 帧)  预计剩余 ${etaStr}`, 30 + pct * 0.65);
                }
                await uploadPromise;
                
                setStatus("正在合成最终视频...", "合并无损音频与画面帧", 98);
                const finalRes = await fetch(`${apiRoot}/videogen/finish`, {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ session_id: initRes.session_id, name: `${data.name} - ${data.artist}` }),
                }).then(r => r.json());
        
                if (finalRes.error) throw new Error(finalRes.error);

                // finalRes.url 已是含 /music 前缀的绝对路径(后端返回 RoutePrefix+/videos/xxx);
                // apiRoot 形如 "<origin>/music",取其 origin 部分再拼,避免 /music 双前缀。
                const apiOrigin = apiRoot.replace(/\/music\/?$/, '');
                const videoUrl = apiOrigin + finalRes.url;
                if (callbacks.onComplete) callbacks.onComplete(videoUrl, `${data.name}.mp4`);
                return videoUrl;

            } catch(e) {
                console.error(e);
                if (callbacks.onError) callbacks.onError(e.message || String(e));
                throw e;
            }
}
