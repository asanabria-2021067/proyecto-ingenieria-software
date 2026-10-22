import { describe, expect, it } from 'vitest';
import { hostnameOf, isBlockedIp, LinkPreviewError, parseSafeUrl } from '../src/chat/link-preview/url-safety';

describe('isBlockedIp IPv4', () => {
  it.each([
    '0.0.0.0',
    '0.1.2.3',
    '10.0.0.1',
    '10.255.255.255',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.1',
    '192.0.2.1',
    '192.168.0.1',
    '192.168.255.255',
    '198.18.0.1',
    '198.19.255.255',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '239.255.255.255',
    '240.0.0.1',
    '255.255.255.255',
  ])('bloquea %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.255.255', '172.32.0.1', '100.63.255.255', '100.128.0.1', '169.253.1.1', '223.255.255.255'])(
    'permite %s',
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );
});

describe('isBlockedIp IPv6', () => {
  it.each([
    '::',
    '::1',
    'fe80::1',
    'fe80::1ff:fe23:4567:890a',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    'ff00::',
    '2001:db8::1',
    '2001::1', // Teredo
    '2001:10::1',
    '100::1',
    '64:ff9b:1::1',
    'fec0::1',
  ])('bloquea %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::ffff:169.254.169.254',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '0:0:0:0:0:ffff:192.168.1.1',
    '::127.0.0.1',
    '64:ff9b::7f00:1',
    '64:ff9b::10.0.0.1',
    '2002:7f00:1::1', // 6to4 con 127.0.0.1
    '2002:0a00:0001::',
  ])('bloquea IPv4 embebida %s', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '::ffff:808:808', '64:ff9b::808:808', '2002:0808:0808::1'])(
    'permite %s',
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );
});

describe('isBlockedIp entradas invalidas', () => {
  it.each(['', 'localhost', 'example.com', '999.1.1.1', '1.2.3', 'zzzz::1'])('bloquea lo no parseable %j', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });
});

describe('parseSafeUrl', () => {
  const reason = (raw: string) => {
    try {
      parseSafeUrl(raw);
    } catch (e) {
      return (e as LinkPreviewError).reason;
    }
    return null;
  };

  it('acepta http y https con puerto implicito, 80 o 443', () => {
    expect(parseSafeUrl('https://example.com/a?b=1').hostname).toBe('example.com');
    expect(parseSafeUrl('http://example.com:80/').hostname).toBe('example.com');
    expect(parseSafeUrl('https://example.com:443/').hostname).toBe('example.com');
    expect(parseSafeUrl('http://example.com:443/').port).toBe('443');
  });

  it.each(['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/', 'javascript:alert(1)', 'data:text/html,hi', 'ws://example.com'])(
    'rechaza esquema %s',
    (raw) => {
      expect(reason(raw)).toBe('scheme');
    },
  );

  it('rechaza URL con credenciales', () => {
    expect(reason('https://user:pass@example.com/')).toBe('credentials');
    expect(reason('https://user@example.com/')).toBe('credentials');
  });

  it.each(['http://example.com:8080/', 'https://example.com:8443/', 'http://example.com:22/', 'http://example.com:6379/'])(
    'rechaza puerto no permitido %s',
    (raw) => {
      expect(reason(raw)).toBe('port');
    },
  );

  it.each(['', 'no es url', '//example.com', 'http://'])('rechaza invalida %j', (raw) => {
    expect(reason(raw)).toBe('invalid-url');
  });

  it('normaliza formas numericas de IPv4 a decimal punteado para que isBlockedIp las atrape', () => {
    for (const raw of ['http://2130706433/', 'http://0x7f.1/', 'http://017700000001/', 'http://127.1/']) {
      expect(isBlockedIp(hostnameOf(parseSafeUrl(raw)))).toBe(true);
    }
  });

  it('hostnameOf quita corchetes de IPv6', () => {
    expect(hostnameOf(parseSafeUrl('http://[::1]/'))).toBe('::1');
    expect(isBlockedIp(hostnameOf(parseSafeUrl('http://[::ffff:127.0.0.1]/')))).toBe(true);
  });
});
