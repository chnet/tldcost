// CloudFront Function (cloudfront-js-2.0), viewer-request.
// 1. Secondary hosts (www., alternate domains): 301 to https://<canonical host><path>, path already
//    normalized to a trailing slash (one hop instead of two).
// 2. Directory URLs without trailing slash (/x, last segment has no dot): 301 to /x/ (Astro trailingSlash 'always').
// 3. Directory URLs with trailing slash (/x/): rewrite to /x/index.html (served from S3, no redirect).
// Placeholders for the canonical host and the redirect host list are substituted at synth time (lib/site-stack.ts).

var CANONICAL_HOST = '__CANONICAL_HOST__';
var REDIRECT_HOSTS = __REDIRECT_HOSTS__;

function buildQueryString(qs) {
  var parts = [];
  for (var key in qs) {
    var entry = qs[key];
    if (entry.multiValue) {
      for (var i = 0; i < entry.multiValue.length; i++) {
        parts.push(key + '=' + entry.multiValue[i].value);
      }
    } else {
      parts.push(entry.value === '' ? key : key + '=' + entry.value);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function redirect(location) {
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: { value: location },
      'cache-control': { value: 'max-age=3600' },
    },
  };
}

function withTrailingSlash(uri) {
  if (uri.endsWith('/')) return uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);
  return lastSegment.indexOf('.') === -1 ? uri + '/' : uri;
}

function handler(event) {
  var request = event.request;
  var hostHeader = request.headers.host;
  var host = hostHeader ? hostHeader.value.toLowerCase() : '';
  var uri = withTrailingSlash(request.uri);

  if (REDIRECT_HOSTS.indexOf(host) !== -1) {
    return redirect('https://' + CANONICAL_HOST + uri + buildQueryString(request.querystring));
  }
  if (uri !== request.uri) {
    // Relative Location keeps the requesting host (apex or the cloudfront.net domain).
    return redirect(uri + buildQueryString(request.querystring));
  }
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  }
  return request;
}
