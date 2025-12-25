
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import compression from 'compression'
import serveStatic from 'serve-static'
import { Redis } from 'ioredis'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isTest = process.env.NODE_ENV === 'test' || !!process.env.VITE_TEST_BUILD

export async function createServerApp(
    root = process.cwd(),
    isProd = process.env.NODE_ENV === 'production',
    hmrPort
) {
    const resolve = (p) => path.resolve(__dirname, p)

    const app = express()
    const httpServer = createServer(app)
    const io = new Server(httpServer)

    const redisPublisher = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')
    const redisSubscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')


    const CHAT_CHANNEL = 'chat_messages'
    const CHAT_HISTORY_KEY = 'chat_history'


    io.on('connection', async (socket) => {
        console.log('A user connected')

        const history = await redisPublisher.lrange(CHAT_HISTORY_KEY, 0, -1)
        const parsedHistory = history.map(msg => JSON.parse(msg)).reverse()
        socket.emit('load_messages', parsedHistory)

        socket.on('chat_message', async (msg) => {

            const msgString = JSON.stringify(msg)


            await redisPublisher.lpush(CHAT_HISTORY_KEY, msgString)
            await redisPublisher.ltrim(CHAT_HISTORY_KEY, 0, 49)

            await redisPublisher.publish(CHAT_CHANNEL, msgString)
        })

        socket.on('disconnect', () => {
            console.log('User disconnected')
        })
    })


    redisSubscriber.subscribe(CHAT_CHANNEL, (err, count) => {
        if (err) console.error('Failed to subscribe: %s', err.message)
    })

    redisSubscriber.on('message', (channel, message) => {
        if (channel === CHAT_CHANNEL) {
            io.emit('chat_message', JSON.parse(message))
        }
    })


    app.use(compression())

    /**
     * @type {import('vite').ViteDevServer}
     */
    let vite
    if (!isProd) {
        vite = await (await import('vite')).createServer({
            root,
            logLevel: isTest ? 'error' : 'info',
            server: {
                middlewareMode: true,
                watch: {
                    usePolling: true,
                    interval: 100
                },
                hmr: {
                    port: hmrPort
                }
            },
            appType: 'custom'
        })

        app.use(vite.middlewares)
    } else {
        app.use(compression())
        app.use(
            serveStatic(resolve('dist/client'), {
                index: false
            })
        )
    }

    app.use('*', async (req, res) => {
        try {
            const url = req.originalUrl

            let template, render
            if (!isProd) {

                template = fs.readFileSync(resolve('index.html'), 'utf-8')
                template = await vite.transformIndexHtml(url, template)
                render = (await vite.ssrLoadModule('/src/entry-server.js')).render
            } else {
                template = fs.readFileSync(resolve('dist/client/index.html'), 'utf-8')
                render = (await import('./dist/server/entry-server.js')).render
            }

            const [appHtml, headTags] = await render(url)

            const html = template
                .replace(`<!--app-head-->`, headTags ?? '')
                .replace(`<!--app-html-->`, appHtml)

            res.status(200).set({ 'Content-Type': 'text/html' }).end(html)
        } catch (e) {
            !isProd && vite.ssrFixStacktrace(e)
            console.log(e.stack)
            res.status(500).end(e.stack)
        }
    })

    return { app, httpServer }
}

if (!isTest) {
    createServerApp().then(({ httpServer }) => {
        httpServer.listen(3000, () => {
            console.log('http://localhost:3000')
        })
    })
}
