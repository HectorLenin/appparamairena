// ============================================
// 1. IMPORTAR MÓDULOS
// ============================================
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const cron = require('node-cron');
const db = require('./database');
const gmail = require('./gmail');
const emailService = require('./emailService');

dotenv.config();

// ============================================
// 2. CREAR LA APP
// ============================================
const app = express();
const PORT = process.env.PORT || 10000;

// ============================================
// 3. MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================
// 4. ENDPOINTS (TODOS DESPUÉS DE `app.use`)
// ============================================

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'OK',
        name: 'Reenvío Netflix Backend (Correo Original)',
        version: '2.0.0',
        admin_email: process.env.ADMIN_EMAIL,
        cycle_days: process.env.CYCLE_DAYS || 20
    });
});

// ============================================
// 5. INICIAR SERVIDOR (AL FINAL)
// ============================================
app.listen(PORT, () => {
    console.log('========================================');
    console.log('✅ REENVÍO NETFLIX - CORREO ORIGINAL');
    console.log('========================================');
    console.log(`📡 Puerto: ${PORT}`);
    console.log(`📧 Admin: ${process.env.ADMIN_EMAIL || 'No configurado'}`);
    console.log(`🔄 Ciclo: cada ${process.env.CYCLE_DAYS || 20} días`);
    console.log('========================================');
});

module.exports = app;
});
