export const notFound = (req, res) => {
    const isAdmin = req.originalUrl.startsWith('/admin');

    const backLink = isAdmin ? '/admin/dashboard' : '/';
    const backText = isAdmin ? '← Back to Dashboard' : '← Back to Home';
    const color    = isAdmin ? '#e6c200' : '#E63946';

    res.status(404).send(`
    <div style="background:#000;color:#fff;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Anton,sans-serif;">
      <h1 style="font-size:6rem;color:${color};margin:0;">404</h1>
      <p style="color:#aaa;">Page not found</p>
      <a href="${backLink}" style="color:${color};text-decoration:none;font-size:1.1rem;">${backText}</a>
    </div>`);
};