# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

import unittest
from ansible_collections.leeo86.bookmarks.plugins.module_utils.bookmarks import (
    BookmarkBuildError, build_entries, entry_matches, v1_plan,
)


class MigrationTests(unittest.TestCase):
    def test_exact_values_and_unnamed_columns(self):
        source = {'bookmarks': {'Control Room': [
            {'id': '1', 'name': 'Device', 'user1': '  pass  ', 'user2': 'unnamed'},
        ]}}
        plan = v1_plan({'nameU1': 'Password'}, source, ['user1'])
        self.assertEqual(plan['entries'][0]['fields'], [
            {'key': 'user1', 'value': '  pass  '},
            {'key': 'user2', 'value': 'unnamed'},
        ])
        self.assertEqual([field['key'] for field in plan['fields']], ['user1', 'user2'])
        self.assertEqual(plan['fields'][1]['label'], 'user2')

    def test_protocols_and_multiple_groups(self):
        for scheme in ('ssh', 'vnc', 'rdp', 'telnet', 'https', 'custom'):
            item = {'id': '1', 'name': 'Device', 'link': scheme + '://user@device.example:22/'}
            plan = v1_plan({}, {'bookmarks': {'A': [item], 'B': [item]}}, [])
            entry = plan['entries'][0]
            self.assertEqual(len(plan['entries']), 1)
            self.assertEqual(entry['host'], 'device.example')
            expected = 'web' if scheme == 'https' else 'other' if scheme == 'custom' else scheme
            self.assertEqual(entry['links'][0]['type'], expected)
            self.assertEqual(entry['tags'], ['group:A', 'group:B'])

    def test_duplicate_groups_fill_missing_fields_and_reject_conflicts(self):
        first = {'id': '1', 'name': 'Device', 'user1': ''}
        second = {'id': '1', 'name': 'Device', 'user1': ' preserved '}
        source = {'bookmarks': {'A': [first], 'B': [second]}}
        plan = v1_plan({}, source, ['user1'])
        self.assertEqual(plan['entries'][0]['fields'], [{'key': 'user1', 'value': ' preserved '}])
        first['user1'] = 'different'
        with self.assertRaises(BookmarkBuildError):
            v1_plan({}, source, ['user1'])

    def test_preserves_favicon_urls_and_resolves_relative_paths_against_v1(self):
        cases = {
            'https://device.example/vendor/favicon.png': ('', 'https://device.example/vendor/favicon.png'),
            'https://device.example/icons/logo.svg': ('', 'https://device.example/icons/logo.svg'),
            'https://device.example/img/icons/logo.svg': ('', 'https://device.example/img/icons/logo.svg'),
            '/vendor/icon.ico': ('', 'https://v1.example/vendor/icon.ico'),
            'custom/logo.png': ('', 'https://v1.example/bookmarks/custom/logo.png'),
            'img/icons/camera.svg': ('camera', ''),
            'https://v1.example/bookmarks/img/icons/camera.svg': ('camera', ''),
            '': ('', ''),
        }
        for favicon, (icon, url) in cases.items():
            with self.subTest(favicon=favicon):
                plan = v1_plan({}, {'bookmarks': {'A': [{'id': '1', 'favicon': favicon}]}}, [],
                               v1_url='https://v1.example/bookmarks/')
                entry = plan['entries'][0]
                self.assertEqual((entry['icon'], entry['favicon_url']), (icon, url))
                desired = build_entries(plan['entries'])[0]
                self.assertEqual(desired['faviconUrl'], url or None)
        with self.assertRaises(BookmarkBuildError):
            v1_plan({}, {'bookmarks': {'A': [{'id': '1', 'favicon': 'file:///etc/passwd'}]}}, [])

    def test_explicit_tag_columns_replace_fields_and_merge_across_groups(self):
        settings = {'nameU1': 'Location', 'hideU1': '1', 'nameU2': 'Password', 'nameU3': 'Tags', 'hideU3': '1'}
        first = {'id': '1', 'user1': ' Control Room ', 'user2': ' secret ', 'user3': 'Timing, primary'}
        second = {'id': '1', 'user1': 'Control Room', 'user3': 'Backup'}
        source = {'bookmarks': {'A': [first], 'B': [second]}}
        plan = v1_plan(settings, source, ['user2'], tag_fields={'user1': 'room', 'user3': ''})
        self.assertEqual([field['key'] for field in plan['fields']], ['user2'])
        self.assertEqual(plan['entries'][0]['fields'], [{'key': 'user2', 'value': ' secret '}])
        self.assertEqual(plan['entries'][0]['tags'], ['Backup', 'Timing, primary', 'group:A', 'group:B', 'room:Control Room'])
        self.assertEqual(v1_plan(settings, {'bookmarks': {'A': [first]}}, [])['fields'][0]['show_as_column'], False)

    def test_rejects_secret_tag_overlap_and_invalid_mappings(self):
        for mapping in ({'user2': 'tag'}, {'user9': 'tag'}, {'user1': 'Room'}, {'user1': 'state'}, ['user1']):
            with self.subTest(mapping=mapping), self.assertRaises(BookmarkBuildError):
                v1_plan({}, {'bookmarks': {}}, ['user2'], tag_fields=mapping)

    def test_favicon_change_is_detected_by_check_mode(self):
        current = {'faviconUrl': '/old.ico'}
        self.assertFalse(entry_matches(current, {'faviconUrl': '/new.ico'}))
        self.assertTrue(entry_matches(current, {'faviconUrl': '/old.ico'}))
