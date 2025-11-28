// Código para banner.js
const cfonts = require('cfonts');

function mostrarBanner() {
    cfonts.say('MAFUYO-BOT', {
        font: 'block',
        align: 'center',
        colors: ['green', 'gray'],
        background: 'transparent',
        letterSpacing: 1,
        lineHeight: 1,
        space: true,
        maxLength: '0',
    });
    cfonts.say('Creado con la guia de JEREMY-EVER', {
        font: 'console',
        align: 'center',
        colors: ['gray'],
    });
}

module.exports = mostrarBanner;