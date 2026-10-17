const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000; // Vous pouvez choisir un autre port si celui-ci est occupé

// Fonction pour obtenir les adresses IP locales de votre machine
function getLocalIPAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Ignorer les adresses IPv6 et les interfaces internes non-IPv4
            if (iface.family === 'IPv4' && !iface.internal) {
                addresses.push(iface.address);
            }
        }
    }
    return addresses;
}

const server = http.createServer((req, res) => {
    console.log(`Requête reçue pour : ${req.url}`);

    // Définir le chemin de base du fichier
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html'; // Servir index.html par défaut pour la racine
    }

    // Obtenir l'extension du fichier pour définir le Content-Type correct
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                // Fichier non trouvé
                fs.readFile('./404.html', (err404, content404) => { // Optionnel : servir une page 404 personnalisée
                    if (err404) {
                        res.writeHead(404, { 'Content-Type': 'text/html' });
                        res.end("404: File Not Found (custom 404 page also not found)", 'utf-8');
                    } else {
                        res.writeHead(404, { 'Content-Type': 'text/html' });
                        res.end(content404, 'utf-8');
                    }
                });
            } else {
                // Erreur serveur
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
            }
        } else {
            // Fichier trouvé, le servir
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    const localIPs = getLocalIPAddresses();
    console.log(`Serveur démarré !`);
    console.log(`Vous pouvez accéder à votre page via :`);
    console.log(`  Localement : http://localhost:${PORT}`);
    if (localIPs.length > 0) {
        console.log(`  Sur votre réseau local (pour votre smartphone) :`);
        localIPs.forEach(ip => {
            console.log(`    http://${ip}:${PORT}`);
        });
    } else {
        console.log("  Impossible de déterminer l'adresse IP locale pour l'accès réseau.");
    }
    console.log("Assurez-vous que votre smartphone est sur le même réseau Wi-Fi.");
    console.log("Vous pourriez avoir besoin d'autoriser Node.js dans votre pare-feu.");
});