const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, DisconnectReason } = require("@whiskeysockets/baileys")
const { Telegraf } = require('telegraf')
const pino = require('pino')
const { Boom } = require('@hapi/boom')

// --- CONFIGURATION ---
const TELEGRAM_TOKEN = 'YAHAN_APNA_TELEGRAM_TOKEN_DALEIN'; 
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
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
        markOnlineOnConnect: true
    })

    sock.ev.on('creds.update', saveCreds)

    // Pairing Code Request Logic
    if (!sock.authState.creds.registered && phoneNumber) {
        try {
            setTimeout(async () => {
                let code = await sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''))
                if (ctx) ctx.reply(`🔥 YOUR PAIRING CODE: ${code}\n\nEnter this in WhatsApp -> Linked Devices`)
            }, 5000)
        } catch (e) {
            if (ctx) ctx.reply("Error: " + e.message)
        }
    }

    // Advanced Connection Monitor
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'open') {
            console.log('✅ WHATSAPP CONNECTED')
            if (ctx) ctx.reply("✅ WhatsApp Connected! 24/7 Status Mode is Live.")
        }
        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output.statusCode
            console.log('Connection closed, reason:', reason)
            if (reason !== DisconnectReason.loggedOut) {
                console.log("Reconnecting...")
                startWA()
            } else {
                console.log("Session Logged Out. Please link again.")
                if (ctx) ctx.reply("❌ Session Logged Out. Please send number again for new code.")
            }
        }
    })

    // 24/7 Status Auto-View & Like Logic
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0]
        if (!m.message || m.key.remoteJid !== 'status@broadcast') return

        try {
            const sender = m.key.participant || m.key.remoteJid
            // 1. Auto View
            await sock.readMessages([m.key]) 
            
            // 2. Short Delay to look human
            await new Promise(res => setTimeout(res, 3000)) 
            
            // 3. Auto Like (Heart Reaction)
            await sock.sendMessage('status@broadcast', { 
                react: { text: "❤️", key: m.key } 
            }, { statusJidList: [sender] })
            
            console.log(`[+] Status Seen & Liked: ${m.pushName || 'User'}`)
        } catch (err) { 
            console.log("Status Process Error:", err.message) 
        }
    })
}

// --- TELEGRAM CONTROLLER ---
teleBot.start((ctx) => ctx.reply("👋 Welcome Developer!\n\nSend WhatsApp number with country code (e.g., 923257641141) to get Pairing Code."))

teleBot.on('text', async (ctx) => {
    const text = ctx.message.text
    if (text.length >= 10 && !isNaN(text.replace('+', ''))) {
        ctx.reply(`⏳ Generating Code for ${text}...`)
        startWA(ctx, text)
    } else {
        ctx.reply("❌ Invalid format. Use: 923257641141")
    }
})

teleBot.launch()
console.log("🚀 Telegram Controller Online...")
startWA().catch(err => console.log("Start Error:", err))
    
