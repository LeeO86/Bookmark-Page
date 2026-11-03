# -*- coding: utf-8 -*-
# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later
from __future__ import absolute_import, division, print_function
__metaclass__ = type

import base64
import re
import ssl
from http.client import HTTPException
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse, urljoin
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener


class FaviconError(Exception):
    pass


def checked_url(url):
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise FaviconError('Use an HTTP(S) image URL without credentials')
    return url


class ImageRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Do not let urllib consume an unbounded redirect body before following it.
        return None


def download_image(url, validate_certs=True, timeout=5, max_bytes=524288):
    checked_url(url)
    if max_bytes <= 0 or timeout <= 0:
        raise FaviconError('timeout and max_bytes must be positive')
    context = ssl.create_default_context() if validate_certs else ssl._create_unverified_context()
    opener = build_opener(ImageRedirects(), HTTPSHandler(context=context))
    try:
        for redirects in range(4):
            try:
                request = Request(url, headers={'User-Agent': 'Bookmark-Page-Ansible', 'Accept': 'image/*'})
                with opener.open(request, timeout=timeout) as response:
                    data = response.read(max_bytes + 1)
                    content_type = response.headers.get_content_type()
                break
            except HTTPError as error:
                try:
                    if error.code in (301, 302, 303, 307, 308) and error.headers.get('Location'):
                        if redirects == 3:
                            raise FaviconError('Image request exceeded 3 redirects')
                        url = checked_url(urljoin(url, error.headers['Location']))
                    else:
                        raise FaviconError('Image request returned %s' % error.code)
                finally:
                    error.close()
    except (URLError, OSError, ValueError, HTTPException) as error:
        raise FaviconError('Image download failed: %s' % error)
    if not data or len(data) > max_bytes:
        raise FaviconError('Image is empty or exceeds max_bytes')
    return data, infer_type(data, content_type)


def infer_type(data, hint=None):
    if data.startswith(b'\x89PNG'):
        return 'image/png'
    if data.startswith(b'\x00\x00\x01\x00'):
        return 'image/x-icon'
    if data.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if data.startswith(b'GIF'):
        return 'image/gif'
    if data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        return 'image/webp'
    if hint == 'image/svg+xml' or b'<svg' in data[:1000]:
        return 'image/svg+xml'
    raise FaviconError('The target did not return a supported image')


def image_data(src=None, content=None, content_type=None, url=None, validate_certs=True, timeout=5, max_bytes=524288):
    if max_bytes <= 0 or timeout <= 0:
        raise FaviconError('timeout and max_bytes must be positive')
    try:
        if url:
            data, inferred = download_image(url, validate_certs, timeout, max_bytes)
        elif src:
            with open(src, 'rb') as handle:
                data = handle.read(max_bytes + 1)
            inferred = infer_type(data, content_type)
        else:
            encoded = re.sub(r'\s', '', content or '')
            if len(encoded) > 4 * ((max_bytes + 2) // 3):
                raise FaviconError('Image exceeds max_bytes')
            data = base64.b64decode(encoded, validate=True)
            inferred = infer_type(data, content_type)
    except (OSError, ValueError, TypeError) as error:
        raise FaviconError('Cannot read image data: %s' % error)
    if not data or len(data) > max_bytes:
        raise FaviconError('Image is empty or exceeds max_bytes')
    return {'contentType': content_type or inferred, 'data': base64.b64encode(data).decode('ascii')}
