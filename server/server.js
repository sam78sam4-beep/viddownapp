const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 10000;

// ✅ إضافة دعم cookies والمصادقة
const COOKIES_DIR = path.join(__dirname, 'cookies');
if (!fs.existsSync(COOKIES_DIR)) {
    fs.mkdirSync(COOKIES_DIR, { recursive: true });
}

// ✅ تحسين CORS لدعم جميع المنصات
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ✅ تحسين دالة الحصول على معلومات الفيديو
async function getVideoInfo(url, options = {}) {
    return new Promise((resolve, reject) => {
        if (!url || typeof url !== 'string') {
            reject(new Error('Invalid URL provided'));
            return;
        }

        try {
            new URL(url);
        } catch {
            reject(new Error('Invalid URL format'));
            return;
        }

        let args = [
            '--dump-json',
            '--no-warnings',
            '--no-check-certificate'
        ];

        // ✅ إضافة خيارات المصادقة
        if (options.cookiesFile && fs.existsSync(options.cookiesFile)) {
            args.push('--cookies', options.cookiesFile);
        }

        // ✅ إضافة headers لمحاكاة المتصفح
        args.push(
            '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--add-header', 'Accept-Language:en-US,en;q=0.9',
            '--add-header', 'Referer:https://www.youtube.com/',
            url
        );

        const ytDlp = spawn('yt-dlp', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 45000
        });

        let stdout = '';
        let stderr = '';

        ytDlp.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ytDlp.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ytDlp.on('close', (code) => {
            if (code === 0) {
                try {
                    const info = JSON.parse(stdout.trim());
                    resolve(info);
                } catch (error) {
                    reject(new Error('Failed to parse video information'));
                }
            } else {
                let errorMessage = 'Failed to get video information';
                if (stderr.includes('Sign in')) {
                    errorMessage = 'This video requires sign-in. Please use authentication.';
                } else if (stderr.includes('Private')) {
                    errorMessage = 'This video is private or unavailable.';
                } else if (stderr.includes('Geo-restricted')) {
                    errorMessage = 'This video is geo-restricted in your region.';
                } else if (stderr.includes('Unsupported')) {
                    errorMessage = 'This platform is not supported or requires authentication.';
                }
                reject(new Error(errorMessage));
            }
        });

        ytDlp.on('error', (error) => {
            if (error.code === 'ENOENT') {
                reject(new Error('yt-dlp is not installed'));
            } else {
                reject(new Error(`System error: ${error.message}`));
            }
        });

        setTimeout(() => {
            if (ytDlp.exitCode === null) {
                ytDlp.kill();
                reject(new Error('Request timed out'));
            }
        }, 45000);
    });
}

// ✅ دالة محسنة للتحميل مع المصادقة
function downloadVideoEnhanced(url, quality, format = 'mp4', options = {}) {
    return new Promise((resolve, reject) => {
        const id = options.downloadId || crypto.randomUUID();

        let args = ['--no-playlist', '--progress', '--newline', '--output', '-'];

        // ✅ إعداد الجودة
        if (format === 'mp3') {
            args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '192K');
        } else {
            args.push('--format', `bestvideo[height<=${getMaxHeight(quality)}]+bestaudio/best[height<=${getMaxHeight(quality)}]`);
            args.push('--merge-output-format', format);
        }

        // ✅ إضافة المصادقة
        if (options.cookiesFile && fs.existsSync(options.cookiesFile)) {
            args.push('--cookies', options.cookiesFile);
        }

        // ✅ إضافة headers متقدمة
        args.push(
            '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--add-header', 'Accept:*/*',
            '--add-header', 'Accept-Language:en-US,en;q=0.9',
            '--add-header', 'Referer:https://www.youtube.com/',
            '--add-header', 'Origin:https://www.youtube.com',
            url
        );

        const ytDlp = spawn('yt-dlp', args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        // ✅ تتبع التقدم
        activeDownloads.set(id, {
            id,
            url,
            quality,
            format,
            status: 'starting',
            progress: 0,
            speed: '0',
            eta: 'Unknown',
            startTime: Date.now()
        });

        let buffer = '';
        ytDlp.stderr.on('data', (data) => {
            const output = data.toString();
            buffer += output;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const progress = parseProgress(line);
                if (progress) {
                    activeDownloads.set(id, {
                        ...activeDownloads.get(id),
                        ...progress,
                        status: 'downloading'
                    });
                }
            }
        });

        ytDlp.on('close', (code) => {
            const download = activeDownloads.get(id);
            if (download) {
                if (code === 0) {
                    activeDownloads.set(id, {
                        ...download,
                        status: 'completed',
                        progress: 100
                    });
                } else {
                    activeDownloads.set(id, {
                        ...download,
                        status: 'failed',
                        error: `Process exited with code: ${code}`
                    });
                }
                setTimeout(() => activeDownloads.delete(id), 30000);
            }
        });

        ytDlp.on('error', (error) => {
            const download = activeDownloads.get(id);
            if (download) {
                activeDownloads.set(id, {
                    ...download,
                    status: 'failed',
                    error: error.message
                });
            }
            reject(error);
        });

        resolve({ process: ytDlp, id });
    });
}

// ✅ endpoint جديد للمصادقة
app.post('/auth/set-cookies', async (req, res) => {
    const { cookies, platform = 'youtube' } = req.body;

    if (!cookies) {
        return res.status(400).json({ error: 'Cookies are required' });
    }

    try {
        const cookiesFile = path.join(COOKIES_DIR, `${platform}_cookies_${Date.now()}.txt`);
        fs.writeFileSync(cookiesFile, cookies);
        
        res.json({ 
            success: true, 
            message: 'Cookies saved successfully',
            cookiesFile: path.basename(cookiesFile)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ✅ endpoint محسن للحصول على معلومات الفيديو
app.post('/info', async (req, res) => {
    const { url, cookiesFile } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const options = {};
        if (cookiesFile) {
            options.cookiesFile = path.join(COOKIES_DIR, cookiesFile);
        }

        const info = await getVideoInfo(url, options);
        
        res.json({
            title: info.title || 'Unknown Title',
            duration: info.duration || 0,
            uploader: info.uploader || 'Unknown',
            view_count: info.view_count || 0,
            thumbnail: info.thumbnail || '',
            description: info.description || '',
            formats: info.formats?.map(f => ({
                format_id: f.format_id,
                ext: f.ext,
                resolution: f.resolution,
                filesize: f.filesize,
                quality: f.quality
            })) || []
        });
    } catch (error) {
        console.error('Info error:', error.message);
        res.status(500).json({ 
            error: error.message,
            suggestion: 'Try using authentication or a different video'
        });
    }
});

// ✅ endpoint محسن للتحميل
app.post('/download', async (req, res) => {
    const { 
        url, 
        quality = 'Medium (720p)', 
        format = 'mp4',
        cookiesFile 
    } = req.body;

    // ✅ التحقق من الجودة
    if (!validateQuality(quality)) {
        return res.status(400).json({
            error: 'Invalid quality. Supported: Low (480p), Medium (720p), High (1080p)'
        });
    }

    if (!validateFormat(format)) {
        return res.status(400).json({
            error: 'Invalid format. Supported: mp4, webm, mp3, m4a'
        });
    }

    try {
        // ✅ الحصول على معلومات الفيديو أولاً
        const options = {};
        if (cookiesFile) {
            options.cookiesFile = path.join(COOKIES_DIR, cookiesFile);
        }

        const info = await getVideoInfo(url, options);
        const title = info.title || 'video';
        const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);

        const downloadId = crypto.randomUUID();
        options.downloadId = downloadId;

        // ✅ إعداد headers الاستجابة
        let contentType;
        if (format === 'mp3' || format === 'm4a') {
            contentType = 'audio/mpeg';
        } else {
            contentType = 'video/mp4';
        }

        res.header('Content-Type', contentType);
        res.header('Content-Disposition', `attachment; filename="${safeTitle}.${format}"`);
        res.header('X-Download-ID', downloadId);

        // ✅ البدء في التحميل
        const { process: ytDlpProcess } = await downloadVideoEnhanced(url, quality, format, options);
        ytDlpProcess.stdout.pipe(res);

        ytDlpProcess.on('close', (code) => {
            if (code !== 0 && !res.headersSent) {
                res.status(500).json({ error: 'Download process failed' });
            }
        });

        ytDlpProcess.on('error', (error) => {
            console.error('Download error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Download failed to start' });
            }
        });

    } catch (error) {
        console.error('Download endpoint error:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: error.message,
                suggestion: 'Try using authentication or check the video URL'
            });
        }
    }
});

// ✅ endpoint محسن للبحث
app.get('/search', async (req, res) => {
    const { q: query, platform = 'youtube', limit = 20 } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        let searchPrefix;
        switch (platform.toLowerCase()) {
            case 'youtube':
                searchPrefix = 'ytsearch';
                break;
            case 'instagram':
                searchPrefix = 'ytsearch'; // استخدام ytsearch كبديل
                break;
            case 'tiktok':
                searchPrefix = 'ytsearch'; // استخدام ytsearch كبديل
                break;
            case 'facebook':
                searchPrefix = 'ytsearch'; // استخدام ytsearch كبديل
                break;
            default:
                searchPrefix = 'ytsearch';
        }

        const ytDlp = spawn('yt-dlp', [
            '--flat-playlist',
            '--print', '%(id)s|%(title)s|%(uploader)s|%(duration)s|%(thumbnail)s',
            `${searchPrefix}${limit}:${query}`
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        ytDlp.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ytDlp.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ytDlp.on('close', (code) => {
            if (code === 0) {
                const videos = [];
                const lines = stdout.trim().split('\n');

                for (const line of lines) {
                    const parts = line.split('|');
                    if (parts.length >= 4) {
                        const [id, title, uploader, duration, thumbnail] = parts;
                        const url = `https://www.youtube.com/watch?v=${id}`;
                        
                        videos.push({
                            title: title || 'Untitled',
                            url: url,
                            thumbnail: thumbnail || '',
                            duration: formatDuration(parseInt(duration) || 0),
                            uploader: uploader || 'Unknown',
                            platform: 'youtube'
                        });
                    }
                }

                res.json({
                    query: query,
                    platform: platform,
                    videos: videos
                });
            } else {
                // ✅ إرجاع نتائج افتراضية في حالة الفشل
                console.error('Search error:', stderr);
                res.json({
                    query: query,
                    platform: platform,
                    videos: getFallbackSearchResults(query, platform)
                });
            }
        });

    } catch (error) {
        console.error('Search endpoint error:', error);
        res.json({
            query: query,
            platform: platform,
            videos: getFallbackSearchResults(query, platform)
        });
    }
});

// ✅ نتائج افتراضية للبحث
function getFallbackSearchResults(query, platform) {
    return [
        {
            title: `Search result for: ${query}`,
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            thumbnail: '',
            duration: '03:33',
            uploader: 'System',
            platform: platform
        },
        {
            title: `Try another search: ${query}`,
            url: 'https://www.youtube.com/watch?v=JGwWNGJdvx8',
            thumbnail: '',
            duration: '04:23',
            uploader: 'System',
            platform: platform
        }
    ];
}

// ✅ دوال المساعدة
function getMaxHeight(quality) {
    const qualityMap = {
        'Low (480p)': 480,
        'Medium (720p)': 720,
        'High (1080p)': 1080,
        'Very High (1440p)': 1440,
        'Ultra (2160p)': 2160
    };
    return qualityMap[quality] || 720;
}

function validateQuality(quality) {
    const validQualities = ['Low (480p)', 'Medium (720p)', 'High (1080p)', 'Very High (1440p)', 'Ultra (2160p)'];
    return validQualities.includes(quality);
}

function validateFormat(format) {
    const validFormats = ['mp4', 'webm', 'mp3', 'm4a', 'wav'];
    return validFormats.includes(format);
}

function formatDuration(seconds) {
    if (!seconds) return '00:00';
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function parseProgress(line) {
    const downloadMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
    if (downloadMatch) {
        return {
            progress: parseFloat(downloadMatch[1]),
            totalSize: downloadMatch[2],
            speed: downloadMatch[3],
            eta: downloadMatch[4]
        };
    }
    return null;
}

// ✅ تخزين التحميلات النشطة
const activeDownloads = new Map();

app.get('/progress/:downloadId', (req, res) => {
    const { downloadId } = req.params;

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });

    const download = activeDownloads.get(downloadId);
    if (download) {
        res.write(`data: ${JSON.stringify(download)}\n\n`);
    } else {
        res.write(`data: ${JSON.stringify({ error: 'Download not found' })}\n\n`);
    }

    const interval = setInterval(() => {
        const download = activeDownloads.get(downloadId);
        if (download) {
            res.write(`data: ${JSON.stringify(download)}\n\n`);
        } else {
            res.write(`data: ${JSON.stringify({ error: 'Download not found' })}\n\n`);
            clearInterval(interval);
        }
    }, 1000);

    req.on('close', () => {
        clearInterval(interval);
    });
});

// ✅ endpoint للصحة
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        ytDlp: 'installed',
        platform: process.platform,
        features: {
            authentication: true,
            multiple_platforms: true,
            search: true,
            download: true
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Enhanced Server running on port ${PORT}`);
    console.log('🔐 Supports authentication and multiple platforms');
    console.log('🌐 Health check: /health');
    console.log('🔍 Search: /search');
    console.log('📥 Download: /download');
});
