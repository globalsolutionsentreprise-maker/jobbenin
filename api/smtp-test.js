module.exports = async (req, res) => {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  const config = {
    host_set: !!host && host.length > 0,
    host_preview: host ? host.substring(0, 20) + '...' : 'VIDE',
    port: port || 'VIDE',
    user_set: !!user && user.length > 0,
    user_preview: user ? user.substring(0, 15) + '...' : 'VIDE',
    pass_set: !!pass && pass.length > 0,
    from_set: !!from && from.length > 0,
    from_preview: from ? from.substring(0, 30) : 'VIDE',
  };

  // Test connexion SMTP
  if (host && user && pass) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host, port: parseInt(port || '587'), secure: false,
      auth: { user, pass },
      connectionTimeout: 5000, greetingTimeout: 5000,
    });
    try {
      await transporter.verify();
      config.smtp_connection = 'OK ✅';
    } catch (e) {
      config.smtp_connection = 'ERREUR ❌: ' + e.message;
    }
  } else {
    config.smtp_connection = 'IGNORÉ (vars manquantes)';
  }

  res.setHeader('Content-Type', 'application/json');
  res.status(200).json(config);
};
