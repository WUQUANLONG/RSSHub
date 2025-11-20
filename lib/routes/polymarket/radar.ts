const rules = [
    {
        title: 'Polymarket Events',
        docs: 'https://docs.rsshub.app/routes/polymarket#events', // 文档完成后需要更新此链接
        source: ['/events'],
        target: '/polymarket/events',
    },
];

export default {
    'polymarket.com': {
        _name: 'Polymarket',
        '.': rules,
    },
};
