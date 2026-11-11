import jsdom from 'jsdom';

export function localResourceOptions(base) {
  const origin = new URL(base).origin;
  return {
    interceptors: [
      jsdom.requestInterceptor((request) =>
        new URL(request.url).origin === origin
          ? undefined
          : new Response('', { status: 200 })
      )
    ]
  };
}
