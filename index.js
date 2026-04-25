const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys")
const { Telegraf } = require('telegraf')
const pino = require('pino')

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = '8630492887:AAHUANE1A6TT9unqiEHO-6u1qw2fjF7pTYE'; 
const teleBot = new Telegraf(TELEGRAM_TOKEN)
let sock;

async function startWA(ctx = null, phoneNumber = "") {
    const { state, saveCreds } = await useMultiFileAuthState('auth_session')
    const { version } = await fetchLatestBaileysVersion()

    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"]
    })

    sock.ev.on('creds.update', saveCreds)

    // Pairing Code Request via Telegram
    if (!sock.authState.creds.registered && phoneNumber) {
        try {
            setTimeout(async () => {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''))
                if (ctx) ctx.reply(`🔥 YOUR PAIRING CODE: ${code}\n\nEnter this in WhatsApp -> Linked Devices`)
            }, 3000)
        } catch (e) {
            if (ctx) ctx.reply("Error: " + e.message)
        }
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'open') {
            console.log('✅ WHATSAPP CONNECTED')
            if (ctx) ctx.reply("✅ WhatsApp Connected Successfully! 24/7 Status Mode is Live.")
        }
        if (connection === 'close') startWA()
    })

    // Auto Status Logic (View + Like)
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0]
        if (!m.message || m.key.remoteJid !== 'status@broadcast') return

        try {
            await sock.readMessages([m.key]) // Auto View
            await new Promise(res => setTimeout(res, 2000)) // 2 sec wait
            
            // Auto Like with Heart
            await sock.sendMessage('status@broadcast', { 
                react: { text: "❤️", key: m.key } 
            }, { statusJidList: [m.key.participant] })
            
            console.log(`[+] Status Seen & Liked: ${m.pushName || 'User'}`)
        } catch (err) { console.log("Status Error:", err) }
    })
}

// --- TELEGRAM INTERFACE ---
teleBot.start((ctx) => ctx.reply("👋 Welcome Developer!\n\nSend your WhatsApp number with country code to link (e.g., 923257641141)"))

teleBot.on('text', async (ctx) => {
    const text = ctx.message.text
    if (text.length >= 10 && !isNaN(text.replace('+', ''))) {
        ctx.reply(`⏳ Generating Pairing Code for ${text}...`)
        startWA(ctx, text)
    } else {
        ctx.reply("❌ Invalid format. Please send number like: 923257641141")
    }
})

teleBot.launch()
console.log("🚀 Telegram Controller Online...")
startWA() // Initial start for session check
