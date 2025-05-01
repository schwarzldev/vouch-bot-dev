const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('SCHWARZDEV Ticket Bot is alive!');
});

app.listen(3000, () => {
  console.log('✅ Keep-alive sunucusu port 3000\'de çalışıyor');
});
