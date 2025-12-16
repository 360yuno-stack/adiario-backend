require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { registrarAccion, obtenerRegistrosUsuario, obtenerRegistrosMes, obtenerResumenMensual } = require('./database');
const { isInCompanyWiFi, getClientIP } = require('./wifi-validator');

const app = express();
app.use(bodyParser.json());

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;

// WEBHOOK VERIFICATION
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
        console.log('✅ Webhook verificado');
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// WEBHOOK MESSAGES
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            body.entry.forEach(entry => {
                entry.changes.forEach(change => {
                    if (change.value.messages) {
                        const message = change.value.messages[0];
                        const from = message.from;
                        const text = message.text.body.toUpperCase().trim();
                        console.log(`📱 Mensaje de ${from}: ${text}`);
                        procesarComando(from, text, req);
                    }
                });
            });
        }
        res.sendStatus(200);
    } catch (error) {
        console.error('❌ Error procesando webhook:', error);
        res.sendStatus(500);
    }
});

function procesarComando(telefono, comando, req) {
    if (comando === 'ENTRAR' || comando === 'SALIR') {
        const clientIP = getClientIP(req);
        console.log(`🔍 Intento de fichaje - Usuario: ${telefono}, IP: ${clientIP}, Acción: ${comando}`);
        
        if (!isInCompanyWiFi(clientIP)) {
            const mensaje = '🚫 *Fichaje bloqueado*\\n\\n' +
                'Solo puedes fichar desde la red WiFi de la empresa.\\n\\n' +
                `Tu IP: ${clientIP}\\n` +
                'Conéctate al WiFi empresarial e intenta de nuevo.';
            sendWhatsAppMessage(telefono, mensaje);
            console.log(`🚫 FICHAJE RECHAZADO - ${telefono} - IP: ${clientIP}`);
            return;
        }

        registrarAccion(telefono, comando, clientIP, (err, registro) => {
            if (err) {
                console.error('Error registrando acción:', err);
                sendWhatsAppMessage(telefono, '❌ Error al registrar. Intenta de nuevo.');
                return;
            }
            const fecha = new Date(registro.fecha_hora).toLocaleString('es-ES');
            const emoji = comando === 'ENTRAR' ? '✅' : '🚪';
            const mensaje = `${emoji} *${comando}* registrado\\n📅 ${fecha}\\n📍 IP: ${clientIP}`;
            sendWhatsAppMessage(telefono, mensaje);
            console.log(`✅ FICHAJE EXITOSO - ${telefono} - ${comando} - IP: ${clientIP}`);
        });
    } else if (comando === 'WIFI') {
        const clientIP = getClientIP(req);
        const enRed = isInCompanyWiFi(clientIP);
        const emoji = enRed ? '✅' : '❌';
        const estado = enRed ? 'conectado' : 'NO conectado';
        const mensaje = `${emoji} *Estado WiFi*\\n\\nEstás ${estado} a la red empresarial.\\n\\nTu IP: ${clientIP}`;
        sendWhatsAppMessage(telefono, mensaje);
    } else if (comando === 'CONSULTA') {
        consultarRegistrosHoy(telefono);
    } else if (comando.startsWith('MES ')) {
        const mes = comando.replace('MES ', '').trim();
        consultarRegistrosMes(telefono, mes);
    } else if (comando === 'AYUDA') {
        enviarAyuda(telefono);
    } else {
        sendWhatsAppMessage(telefono, '❓ Comando no reconocido. Envía *AYUDA*');
    }
}

function consultarRegistrosHoy(telefono) {
    const hoy = new Date().toISOString().split('T')[0];
    obtenerRegistrosUsuario(telefono, null, (err, registros) => {
        if (err) {
            sendWhatsAppMessage(telefono, '❌ Error al consultar.');
            return;
        }
        const registrosHoy = registros.filter(r => r.fecha_hora.startsWith(hoy));
        if (registrosHoy.length === 0) {
            sendWhatsAppMessage(telefono, '📋 No tienes registros hoy.');
            return;
        }
        let mensaje = '📋 *Registros de hoy:*\\n\\n';
        registrosHoy.forEach(r => {
            const hora = new Date(r.fecha_hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            mensaje += `${r.accion === 'ENTRAR' ? '✅' : '🚪'} ${r.accion} - ${hora}\\n`;
        });
        sendWhatsAppMessage(telefono, mensaje);
    });
}

function consultarRegistrosMes(telefono, mesAno) {
    obtenerRegistrosUsuario(telefono, mesAno, (err, registros) => {
        if (err || registros.length === 0) {
            sendWhatsAppMessage(telefono, `📋 No hay registros en ${mesAno}`);
            return;
        }
        let mensaje = `📋 *Registros ${mesAno}:*\\n\\n`;
        registros.slice(0, 10).forEach(r => {
            const fecha = new Date(r.fecha_hora).toLocaleDateString('es-ES');
            mensaje += `${r.accion === 'ENTRAR' ? '✅' : '🚪'} ${r.accion} - ${fecha}\\n`;
        });
        mensaje += `\\n📊 Total: ${registros.length}`;
        sendWhatsAppMessage(telefono, mensaje);
    });
}

function enviarAyuda(telefono) {
    const mensaje = `🤖 *A DIARIO - Control Horario*

*Comandos:*
✅ *ENTRAR* - Registrar entrada
🚪 *SALIR* - Registrar salida
📋 *CONSULTA* - Ver hoy
📅 *MES 2025-12* - Ver mes
📶 *WIFI* - Verificar conexión
❓ *AYUDA* - Este mensaje

⚠️ ENTRAR/SALIR solo desde WiFi empresa`.trim();
    sendWhatsAppMessage(telefono, mensaje);
}

async function sendWhatsAppMessage(to, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                to: to,
                text: { body: text }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`✉️ Mensaje enviado a ${to}`);
    } catch (error) {
        console.error('❌ Error:', error.response?.data || error.message);
    }
}

app.get('/', (req, res) => {
    res.send('<h1>✅ A DIARIO activo</h1>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 A DIARIO en puerto ${PORT}`);
    console.log(`🔒 WiFi empresarial: ${process.env.ALLOWED_IPS}`);
});
