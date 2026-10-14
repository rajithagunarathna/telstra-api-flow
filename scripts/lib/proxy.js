'use strict';
function proxyUrl(args) {
  if (!args.proxyHost && !args.proxy) {
    throw new Error('Live export requires --proxy-host / API_PROXY_HOST or --proxy / API_PROXY');
  }
  let proxy;
  try {
    // A separate host takes precedence over the legacy URL.
    proxy = new URL(args.proxyHost
      ? `${args.proxyScheme || 'http'}://${args.proxyHost}` : args.proxy);
  } catch { throw new Error('Invalid proxy host or URL'); }
  if (!['http:', 'https:'].includes(proxy.protocol)) throw new Error('Proxy must use http:// or https://');
  if (proxy.pathname !== '/' || proxy.search || proxy.hash) throw new Error('Proxy must contain only a host and port');
  if (args.proxyHost && (proxy.username || proxy.password)) throw new Error('Use separate proxy username and password settings');
  if (args.proxyPort !== undefined) {
    const port = Number(args.proxyPort);
    if (!/^\d+$/.test(String(args.proxyPort)) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Proxy port must be an integer from 1 to 65535');
    }
    proxy.port = String(port);
  }
  if (args.proxyUsername !== undefined || args.proxyPassword !== undefined) {
    if (!args.proxyUsername || args.proxyPassword === undefined) {
      throw new Error('Set both proxy username and proxy password for proxy authentication');
    }
    // Encode raw credentials once, including @, :, %, # and backslashes.
    proxy.username = encodeURIComponent(args.proxyUsername);
    proxy.password = encodeURIComponent(args.proxyPassword);
  }
  return proxy;
}

module.exports = { proxyUrl };
