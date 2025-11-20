// lib/routes/polymarket/router.ts
module.exports = function (router) {
    router.get('/events', require('./events'));
    router.get('/history-price', require('./history-price'));
};
