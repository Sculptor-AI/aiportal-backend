# Troubleshooting

## Common Issues

### Port in use
```bash
PORT=3001 npm start
```

### Can't connect from other devices
- Check firewall settings
- Use network IP, not localhost
- Run `npm run network` to see your IP

### Invalid API key
- Use `X-API-Key` header for API keys (starts with `ak_`)
- Use `Authorization: Bearer` for JWT tokens

### No AI response
- Check you have real API keys in .env
- Custom models work without real keys for testing

## Health Check

```bash
curl http://YOUR_IP:3000/health
```

Should return: `{"status":"OK","message":"Server is running"}`