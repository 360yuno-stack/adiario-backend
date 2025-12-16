const ipRangeCheck = require('ip-range-check');
require('dotenv').config();

const ALLOWED_IPS = process.env.ALLOWED_IPS 
    ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim())
    : ['10.101.101.0/26'];

function isInCompanyWiFi(ip) {
    const cleanIP = ip.replace(/^::ffff:/, '');
    
    console.log('🔍 Validando IP:', cleanIP);
    console.log('📋 Rangos permitidos:', ALLOWED_IPS);
    
    for (let range of ALLOWED_IPS) {
        try {
            if (ipRangeCheck(cleanIP, range)) {
                console.log(`✅ IP ${cleanIP} AUTORIZADA (dentro de ${range})`);
                return true;
            }
        } catch (error) {
            console.error(`❌ Error validando rango ${range}:`, error.message);
        }
    }
    
    console.log(`❌ IP ${cleanIP} BLOQUEADA (fuera de red empresarial)`);
    return false;
}

function getClientIP(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() 
        || req.headers['x-real-ip'] 
        || req.connection?.remoteAddress 
        || req.socket?.remoteAddress
        || req.ip;
    
    return ip;
}

module.exports = { isInCompanyWiFi, getClientIP };
