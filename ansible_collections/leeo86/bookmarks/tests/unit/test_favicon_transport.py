# -*- coding: utf-8 -*-
# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later
import base64
import gzip
import os
import threading
import unittest
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from ansible_collections.leeo86.bookmarks.plugins.module_utils.favicon import download_image, image_data, FaviconError, IMAGE_ACCEPT
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import v1_plan, BookmarkBuildError

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=')


class ImageHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path.startswith('http:'):
            self.send_error(403)
            return
        if self.headers.get('Accept') != IMAGE_ACCEPT:
            self.send_error(415)
            return
        encoding, data = '', PNG
        if self.path in ('/gzip', '/bomb', '/truncated', '/members'):
            encoding = 'gzip'
            data = gzip.compress(PNG if self.path != '/bomb' else b'\x89PNG' + b'0' * 100000)
            if self.path == '/truncated':
                data = data[:-3]
            if self.path == '/members':
                data = gzip.compress(PNG[:4]) + gzip.compress(PNG[4:])
        elif self.path == '/deflate':
            encoding, data = 'deflate', zlib.compress(PNG)
        elif self.path == '/raw-deflate':
            compressor = zlib.compressobj(wbits=-zlib.MAX_WBITS)
            encoding, data = 'deflate', compressor.compress(PNG) + compressor.flush()
        elif self.path == '/bad':
            encoding, data = 'gzip', b'invalid'
        elif self.path == '/unknown':
            encoding, data = 'br', b'invalid'
        elif self.path == '/wire-oversize':
            data = PNG + b'0' * 2000
        self.send_response(200)
        self.send_header('Content-Type', 'image/x-icon')  # Devices may mislabel a PNG.
        if encoding:
            self.send_header('Content-Encoding', encoding)
        self.end_headers()
        self.wfile.write(data)


class FaviconTransportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), ImageHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:%d' % cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_browser_accept_and_unsolicited_compression(self):
        for path in ('/plain', '/gzip', '/deflate', '/raw-deflate', '/members'):
            with self.subTest(path=path):
                data, media_type = download_image(self.base + path, use_proxy=False)
                self.assertEqual(data, PNG)
                self.assertEqual(media_type, 'image/png')

    def test_decoded_and_encoded_limits_and_invalid_compression(self):
        for path in ('/bomb', '/wire-oversize', '/truncated', '/bad', '/unknown'):
            with self.subTest(path=path), self.assertRaises(FaviconError):
                download_image(self.base + path, max_bytes=1024, use_proxy=False)

    def test_proxy_defaults_and_explicit_bypass_with_cidr_no_proxy(self):
        with patch.dict(os.environ, {'http_proxy': self.base, 'no_proxy': '127.0.0.0/8'}, clear=True):
            with self.assertRaisesRegex(FaviconError, '403'):
                download_image(self.base + '/plain')
            payload = image_data(url=self.base + '/gzip', use_proxy=False)
            self.assertEqual(base64.b64decode(payload['data']), PNG)

    def test_loopback_checks_are_skipped_without_changing_entries(self):
        hosts = ['localhost', 'LOCALHOST.', '127.0.0.1', '127.42.17.9', '[::1]', '[0:0:0:0:0:0:0:1]', '127.1', '[::ffff:127.0.0.1]', 'device.example']
        source = {'bookmarks': {'Tools': [dict(id=str(i), name='Tool', link='http://' + host + ':8080/', favicon='http://' + host + '/icon.ico')
                                          for i, host in enumerate(hosts)]}}
        plan = v1_plan({}, source, [], checks=[dict(name='ping', kind='icmp')], favicon_checks=True)
        self.assertEqual(len(plan['entries']), len(hosts))
        self.assertTrue(all(not entry['checks'] for entry in plan['entries'][:-1]))
        self.assertEqual([check['kind'] for check in plan['entries'][-1]['checks']], ['icmp', 'image'])

    def test_field_min_roles_are_optional_and_validated(self):
        settings = {'nameU1': 'Name', 'nameU8': 'Password'}
        source = {'bookmarks': {'A': [dict(id='1', link='http://device.example/', user1='value', user8='fixture-only')]}}
        unchanged = v1_plan(settings, source, ['user8'])
        self.assertTrue(all(field['min_role'] == 'viewer' for field in unchanged['fields']))
        custom = v1_plan(settings, source, ['user8'], field_min_roles={'user1': 'anonymous', 'user8': 'editor'})
        self.assertEqual({field['key']: field['min_role'] for field in custom['fields']}, {'user1': 'anonymous', 'user8': 'editor'})
        self.assertEqual(custom['fields'][1]['type'], 'secret')
        for roles in ({'password': 'admin'}, {'user8': 'owner'}, ['editor'], {'user1': None}):
            with self.subTest(roles=roles), self.assertRaises(BookmarkBuildError):
                v1_plan(settings, source, ['user8'], field_min_roles=roles)
