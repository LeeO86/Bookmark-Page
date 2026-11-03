# -*- coding: utf-8 -*-
# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later
import unittest
from email.message import Message
from io import BytesIO
from urllib.error import HTTPError
from unittest.mock import patch, MagicMock
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    v1_plan, BookmarkBuildError, build_check, build_field_value, common_argument_spec,
    entry_argument_spec, protect_entry_fields,
)
from ansible_collections.leeo86.bookmarks.plugins.module_utils.favicon import image_data, FaviconError, download_image


class DeviceMigrationTests(unittest.TestCase):
    def test_split_tags_and_checks_and_overrides(self):
        bookmarks = {'bookmarks': {'A': [{'id': 1, 'name': 'Device', 'link': 'http://device.example/',
                                         'favicon': 'http://old.example/icon.ico', 'user3': 'Vendor, Model, , Room'}]}}
        plan = v1_plan({}, bookmarks, [], tag_fields={'user3': {'namespace': '', 'split': ','}},
                       checks=[{'name': 'ping', 'kind': 'icmp'}], favicon_checks=True,
                       favicon_overrides={1: 'http://device.example/icon.ico'})
        entry = plan['entries'][0]
        self.assertEqual(entry['tags'], ['Model', 'Room', 'Vendor', 'group:A'])
        self.assertEqual([item['kind'] for item in entry['checks']], ['icmp', 'image'])
        self.assertEqual(entry['checks'][1]['url_template'], 'http://device.example/icon.ico')
        again = v1_plan({}, bookmarks, [], tag_fields={'user3': ''}, favicon_overrides={'1': ''}, favicon_checks=True)
        self.assertEqual(again['entries'][0]['tags'], ['Vendor, Model, , Room', 'group:A'])
        self.assertEqual(again['entries'][0]['favicon_url'], '')
        self.assertEqual(again['entries'][0]['checks'], [])

    def test_invalid_separator_and_secret_tag_are_rejected(self):
        for options in [{'user3': {'split': ''}}, {'user3': {'namespace': 'state', 'split': ','}}]:
            with self.assertRaises(BookmarkBuildError):
                v1_plan({}, {'bookmarks': {}}, [], tag_fields=options)
        with self.assertRaises(BookmarkBuildError):
            v1_plan({}, {'bookmarks': {}}, ['user3'], tag_fields={'user3': {'namespace': '', 'split': ','}})

    def test_image_checks_and_secret_value(self):
        self.assertNotIn('requestSpec', build_check({'name': 'favicon', 'kind': 'image'}))
        self.assertEqual(build_check({'name': 'image', 'kind': 'image', 'url_template': 'http://device.example/icon.ico'})['requestSpec']['method'], 'GET')
        self.assertEqual(build_field_value({'key': 'password', 'secret_value': 'fixture-only'}), {'key': 'password', 'value': 'fixture-only'})
        with self.assertRaises(BookmarkBuildError):
            build_field_value({'key': 'x', 'value': 'a', 'secret_value': 'b'})

    def test_only_known_public_values_are_removed_from_global_redaction(self):
        class Module:
            params = {'api_token': 'fixture-token', 'password': 'fixture-password', 'entries': [
                {'fields': [{'key': 'public', 'value': '-'}, {'key': 'public', 'value': 'user'},
                            {'key': 'secret', 'value': 'legacy-secret'}, {'key': 'public', 'secret_value': 'explicit-secret'},
                            {'key': 'unknown', 'value': 'unknown-private'}]}]}
            argument_spec = dict(common_argument_spec(), entries={'type': 'list', 'options': entry_argument_spec()})
            no_log_values = {'-', 'user', 'legacy-secret', 'explicit-secret', 'unknown-private', 'fixture-token', 'fixture-password'}
        module = Module()
        response = {'fields': [{'key': 'public', 'type': 'text'}, {'key': 'secret', 'type': 'secret'}]}
        with patch('ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks.api', return_value=response):
            protect_entry_fields(module)
        self.assertEqual(module.no_log_values, {'legacy-secret', 'explicit-secret', 'unknown-private', 'fixture-token', 'fixture-password'})

    def test_download_is_bounded_and_does_not_read_redirect_bodies(self):
        from ansible_collections.leeo86.bookmarks.plugins.module_utils import favicon
        headers = Message()
        headers['Location'] = '/icon.png'
        body = BytesIO(b'large redirect body')
        redirect = HTTPError('https://device.example/start', 302, 'Found', headers, body)
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b'\x89PNG12345'
        response.headers.get_content_type.return_value = 'image/png'
        opener = MagicMock()
        opener.open.side_effect = [redirect, response]
        with patch.object(favicon, 'build_opener', return_value=opener):
            self.assertEqual(download_image('https://device.example/start', max_bytes=32)[0], b'\x89PNG12345')
        response.read.assert_called_once_with(33)
        self.assertTrue(body.closed)
        self.assertEqual(opener.open.call_args[0][0].full_url, 'https://device.example/icon.png')
        with self.assertRaises(FaviconError):
            image_data(src='unused', max_bytes=-2)

    def test_bad_and_oversize_images_reject_before_upload(self):
        with self.assertRaises(FaviconError):
            image_data(content='%%%')
        with self.assertRaises(FaviconError):
            image_data(content='a' * 10000, max_bytes=10)


if __name__ == '__main__':
    unittest.main()
