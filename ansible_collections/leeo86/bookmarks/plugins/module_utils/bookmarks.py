# -*- coding: utf-8 -*-

# Copyright (c) Bookmark-Page
# GNU General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/gpl-3.0.txt)
# SPDX-License-Identifier: GPL-3.0-or-later

from __future__ import absolute_import, division, print_function
__metaclass__ = type

import base64
import mimetypes
import json
import re
import ipaddress
from socket import inet_aton
from collections.abc import Mapping, Sequence
from urllib.parse import quote, urljoin, urlparse

from ansible.module_utils.common.parameters import env_fallback
from ansible.module_utils.urls import fetch_url


LINK_TYPES = ['web', 'api', 'ssh', 'vnc', 'rdp', 'telnet', 'other']
CHECK_KINDS = ['icmp', 'tcp', 'http', 'image']
CHECK_EXECUTORS = ['server', 'client']
FIELD_TYPES = ['text', 'url', 'number', 'secret']
ROLES = ['anonymous', 'viewer', 'editor', 'admin']
ICON_RE = re.compile(r'(?:^|/)img/icons/([^/?#]+)\.svg(?:$|[?#])', re.IGNORECASE)


class BookmarkBuildError(Exception):
    """Raised when an Ansible value cannot be turned into an API payload."""


def common_argument_spec():
    return dict(
        api_url=dict(
            type='str',
            required=True,
            fallback=(env_fallback, ['BOOKMARKS_API_URL']),
        ),
        api_token=dict(
            type='str',
            no_log=True,
            fallback=(env_fallback, ['BOOKMARKS_API_TOKEN']),
        ),
        username=dict(type='str', fallback=(env_fallback, ['BOOKMARKS_USERNAME'])),
        password=dict(type='str', no_log=True, fallback=(env_fallback, ['BOOKMARKS_PASSWORD'])),
        validate_certs=dict(type='bool', default=True),
    )


def link_spec():
    return dict(
        type='list',
        elements='dict',
        options=dict(
            label=dict(type='str', required=True),
            url_template=dict(type='str', required=True),
            type=dict(type='str', choices=LINK_TYPES, default='web'),
            primary=dict(type='bool', default=False),
            sort=dict(type='int', default=0),
            icon=dict(type='str'),
        ),
    )


def field_value_spec():
    return dict(
        type='list',
        elements='dict',
        options=dict(
            key=dict(type='str', required=True, no_log=False),
            value=dict(type='str', no_log=True),
            secret_value=dict(type='str', no_log=True),
        ),
    )


def check_spec():
    return dict(
        type='list',
        elements='dict',
        options=dict(
            name=dict(type='str', required=True),
            kind=dict(type='str', required=True, choices=CHECK_KINDS),
            executor=dict(type='str', choices=CHECK_EXECUTORS, default='server'),
            interval_seconds=dict(type='int', default=60),
            timeout_ms=dict(type='int', default=5000),
            tls_verify=dict(type='bool', default=False),
            host=dict(type='str'),
            port=dict(type='int'),
            link_label=dict(type='str'),
            method=dict(type='str', default='GET'),
            url_template=dict(type='str'),
        ),
    )


def entry_argument_spec():
    spec = dict(
        external_key=dict(type='str', required=True, no_log=False),
        name=dict(type='str'),
        description=dict(type='str'),
        host=dict(type='str'),
        icon=dict(type='str'),
        favicon_url=dict(type='str'),
        sort=dict(type='int'),
        tags=dict(type='list', elements='raw'),
        links=link_spec(),
        fields=field_value_spec(),
        checks=check_spec(),
    )
    return spec


def prompt_spec():
    return dict(
        type='list',
        elements='dict',
        options=dict(
            name=dict(type='str', required=True),
            label=dict(type='str', required=True),
            type=dict(type='str', choices=['text', 'password', 'number'], default='text'),
            default_value=dict(type='str', no_log=True),
            required=dict(type='bool', default=True),
        ),
    )


def api(module, method, path, payload=None):
    url = module.params['api_url'].rstrip('/') + path
    headers = {'Accept': 'application/json'}
    token = module.params.get('api_token')
    if token:
        headers['Authorization'] = 'Bearer %s' % token
    else:
        parsed = urlparse(module.params['api_url'])
        headers['Origin'] = '%s://%s' % (parsed.scheme, parsed.netloc)
        if not getattr(module, '_bookmarks_cookie', None):
            username, password = module.params.get('username'), module.params.get('password')
            if not username or not password:
                module.fail_json(msg='Supply api_token or both username and password (or their BOOKMARKS_ environment variables)')
            response, info = fetch_url(module, module.params['api_url'].rstrip('/') + '/api/v1/auth/login',
                                       method='POST', timeout=60,
                                       headers=dict(headers, **{'Content-Type': 'application/json'}),
                                       data=json.dumps({'username': username, 'password': password}).encode('utf-8'))
            if response is not None:
                response.read()
            if info.get('status') != 200 or not info.get('cookies_string'):
                module.fail_json(msg='Bookmark-Page session login failed (%s)' % info.get('status'))
            module._bookmarks_cookie = info['cookies_string']
        headers['Cookie'] = module._bookmarks_cookie
    data = None
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    response, info = fetch_url(
        module,
        url,
        data=data,
        headers=headers,
        method=method,
        timeout=60,
    )
    status = info.get('status') or 0
    if response is not None:
        raw = response.read()
    else:
        raw = info.get('body') or ''
    if isinstance(raw, bytes):
        raw = raw.decode('utf-8')
    try:
        body = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        body = {'raw': raw}
    if status < 200 or status >= 300:
        message = raw
        if isinstance(body, dict) and isinstance(body.get('error'), dict):
            message = body['error'].get('message') or raw
        module.fail_json(
            msg='Bookmark-Page API %s %s failed (%s): %s' % (method, path, status, message),
            status=status,
        )
    return body if isinstance(body, dict) else {'data': body}


def list_entries(module):
    return api(module, 'GET', '/api/v1/entries').get('entries', [])


def find_managed(module, scope, external_key):
    source = 'ansible:%s' % scope
    for entry in list_entries(module):
        if entry.get('source') == source and entry.get('externalKey') == external_key:
            return entry
    return None


def normalize_icon(value):
    if value in (None, ''):
        return None
    if ':' in value:
        return value
    return 'lucide:%s' % value


def build_links(links):
    built = []
    primary_count = 0
    for link in links:
        primary = bool(link.get('primary'))
        if primary:
            primary_count += 1
        built.append({
            'label': link['label'],
            'urlTemplate': link['url_template'],
            'type': link.get('type') or 'web',
            'isPrimary': primary,
            'sort': link.get('sort') or 0,
            'iconRef': normalize_icon(link.get('icon')),
        })
    if built and primary_count == 0:
        built[0]['isPrimary'] = True
    elif built and primary_count != 1:
        raise BookmarkBuildError('An entry with links needs exactly one primary link')
    return built


def build_check(check):
    if check['kind'] == 'tcp' and check.get('port') is None:
        raise BookmarkBuildError('TCP check %s needs a port' % check['name'])
    payload = {
        'name': check['name'],
        'kind': check['kind'],
        'executor': check.get('executor') or 'server',
        'intervalSeconds': check.get('interval_seconds') or 60,
        'timeoutMs': check.get('timeout_ms') or 5000,
        'tlsVerify': bool(check.get('tls_verify')),
    }
    if check.get('host') is not None:
        payload['host'] = check['host']
    if check.get('port') is not None:
        payload['port'] = check['port']
    if check.get('link_label'):
        payload['linkLabel'] = check['link_label']
    if check['kind'] == 'http' or (check['kind'] == 'image' and check.get('url_template')):
        payload['requestSpec'] = {
            'method': (check.get('method') or 'GET').upper(),
            'urlTemplate': check.get('url_template') or 'https://{{host}}/',
            'headers': {},
            'bodyTemplate': None,
            'tlsVerify': bool(check.get('tls_verify')),
            'timeoutMs': check.get('timeout_ms') or 5000,
            'expectation': {
                'status': ['2xx'],
                'bodyContains': None,
                'bodyRegex': None,
                'jsonPath': None,
                'equals': None,
            },
        }
    return payload


def build_entry(params):
    payload = {}
    if params.get('external_key') is not None:
        payload['externalKey'] = params['external_key']
    if params.get('name') is not None:
        payload['name'] = params['name']
    if params.get('description') is not None:
        payload['description'] = params['description']
    if params.get('host') is not None:
        payload['host'] = params['host']
    if params.get('icon') is not None:
        payload['iconRef'] = normalize_icon(params['icon'])
    if params.get('favicon_url') is not None:
        payload['faviconUrl'] = params['favicon_url'] or None
    if params.get('sort') is not None:
        payload['sort'] = params['sort']
    if params.get('tags') is not None:
        payload['tags'] = [tag_token(item) and item for item in params['tags']]
    if params.get('links') is not None:
        payload['links'] = build_links(params['links'])
    if params.get('fields') is not None:
        payload['fields'] = [build_field_value(item) for item in params['fields']]
    if params.get('checks') is not None:
        payload['checks'] = [build_check(item) for item in params['checks']]
    return payload


def build_entries(entries):
    built = []
    seen = set()
    for params in entries:
        try:
            entry = build_entry(params)
        except BookmarkBuildError as error:
            raise BookmarkBuildError('%s (%s)' % (error, params.get('external_key'))) from error
        key = entry.get('externalKey')
        if key in seen:
            raise BookmarkBuildError('Duplicate external_key %s' % key)
        seen.add(key)
        built.append(entry)
    return built


def managed_labels(current, prefix):
    labels = []
    for path in current.get('managedFields') or []:
        if isinstance(path, str) and path.startswith(prefix):
            labels.append(path[len(prefix):])
    return labels


def claimed(current, path):
    return path in (current.get('managedFields') or [])


def canonical(value):
    if isinstance(value, Mapping):
        return {key: canonical(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [canonical(item) for item in value]
    return value


def same_json(left, right):
    return canonical(left) == canonical(right)


def entry_matches(current, desired):
    if 'name' in desired and current.get('name') != desired['name']:
        return False
    if 'description' in desired and (current.get('description') or '') != desired['description']:
        return False
    if 'host' in desired and (current.get('host') or None) != (desired.get('host') or None):
        return False
    if 'iconRef' in desired and (current.get('iconRef') or None) != desired.get('iconRef'):
        return False
    if 'faviconUrl' in desired and (current.get('faviconUrl') or None) != desired.get('faviconUrl'):
        return False
    if 'sort' in desired and current.get('sort') != desired['sort']:
        return False
    if 'tags' in desired and not tags_match(current, desired['tags']):
        return False
    if 'links' in desired and not links_match(current, desired['links']):
        return False
    if 'fields' in desired and not fields_match(current, desired['fields']):
        return False
    if 'checks' in desired and not checks_match(current, desired['checks']):
        return False
    return True


def tag_token(item):
    if isinstance(item, dict):
        token = item.get('tag')
        if not token or not isinstance(token, str):
            raise BookmarkBuildError('A tag mapping needs a tag string')
        return token
    if not isinstance(item, str) or not item:
        raise BookmarkBuildError('Tags must be strings or mappings with a tag')
    return item


def tags_match(current, desired_tags):
    desired = set(tag_token(item) for item in desired_tags)
    present = set(tag.get('label') for tag in current.get('tags') or [])
    for label in managed_labels(current, 'tags:'):
        if label not in desired:
            return False
    for label in desired:
        if label not in present or not claimed(current, 'tags:%s' % label):
            return False
    current_labels = {tag.get('label'): tag.get('displayLabel') for tag in current.get('tags') or []}
    for item in desired_tags:
        if isinstance(item, dict) and 'label' in item:
            if (current_labels.get(tag_token(item)) or None) != (item.get('label') or None):
                return False
    return True


def links_match(current, desired_links):
    present = {link.get('label'): link for link in current.get('links') or []}
    desired = {link['label']: link for link in desired_links}
    for label in managed_labels(current, 'links:'):
        if label not in desired:
            return False
    for link in desired_links:
        found = present.get(link['label'])
        if found is None or not claimed(current, 'links:%s' % link['label']):
            return False
        if found.get('urlTemplate') != link['urlTemplate'] or found.get('type') != link['type']:
            return False
        if bool(found.get('isPrimary')) != bool(link['isPrimary']) or found.get('sort') != link['sort']:
            return False
        if (found.get('iconRef') or None) != (link.get('iconRef') or None):
            return False
    return True


def fields_match(current, desired_fields):
    present = {field.get('key'): field for field in current.get('fields') or []}
    desired_keys = set(field['key'] for field in desired_fields)
    for key in managed_labels(current, 'fields:'):
        if key not in desired_keys:
            return False
    for field in desired_fields:
        found = present.get(field['key'])
        if found is None or not claimed(current, 'fields:%s' % field['key']):
            return False
        if found.get('masked'):
            continue
        if (found.get('value') or '') != field['value']:
            return False
    return True


def checks_match(current, desired_checks):
    present = {check.get('name'): check for check in current.get('checks') or []}
    desired_names = set(check['name'] for check in desired_checks)
    for name in managed_labels(current, 'checks:'):
        if name not in desired_names:
            return False
    for check in desired_checks:
        found = present.get(check['name'])
        if found is None or not claimed(current, 'checks:%s' % check['name']):
            return False
        if not check_same(found, check):
            return False
    return True


def check_same(found, check):
    if found.get('kind') != check['kind'] or found.get('executor') != check['executor']:
        return False
    if found.get('intervalSeconds') != check['intervalSeconds']:
        return False
    if found.get('timeoutMs') != check['timeoutMs']:
        return False
    if bool(found.get('tlsVerify')) != bool(check['tlsVerify']):
        return False
    if (found.get('host') or None) != (check.get('host') or None):
        return False
    if (found.get('port') or None) != (check.get('port') or None):
        return False
    if (found.get('linkLabel') or None) != (check.get('linkLabel') or None):
        return False
    if check['kind'] in ('http', 'image'):
        return same_json(found.get('requestSpec') or {}, check.get('requestSpec') or {})
    return True


def build_request(params):
    method = (params.get('method') or 'GET').upper()
    body = params.get('body_template')
    return {
        'method': method,
        'urlTemplate': params['url_template'],
        'headers': params.get('headers') or {},
        'bodyTemplate': body if body else None,
        'tlsVerify': bool(params.get('tls_verify')),
        'timeoutMs': params.get('timeout_ms') or 5000,
        'expectation': {
            'status': list(params.get('expect_status') or ['2xx']),
            'bodyContains': params.get('expect_body_contains') or None,
            'bodyRegex': params.get('expect_body_regex') or None,
            'jsonPath': params.get('expect_json_path') or None,
            'equals': params.get('expect_equals') or None,
        },
    }


def build_template(params):
    method = (params.get('method') or 'GET').upper()
    if params.get('confirm') is None:
        confirm = method != 'GET'
    else:
        confirm = bool(params.get('confirm'))
    inputs = []
    for item in params.get('inputs') or []:
        inputs.append({
            'name': item['name'],
            'label': item['label'],
            'type': item.get('type') or 'text',
            'defaultValue': item.get('default_value'),
            'required': True if item.get('required') is None else bool(item.get('required')),
        })
    return {
        'name': params['name'],
        'icon': normalize_icon(params.get('icon')) if params.get('icon') else None,
        'query': params.get('query') or '',
        'requestSpec': build_request(params),
        'inputs': inputs,
        'confirm': confirm,
        'minRole': params.get('min_role') or 'editor',
    }


def template_view(template):
    return {
        'name': template.get('name'),
        'icon': template.get('icon') or None,
        'query': template.get('query') or '',
        'requestSpec': template.get('requestSpec') or {},
        'inputs': template.get('inputs') or [],
        'confirm': template.get('confirm'),
        'minRole': template.get('minRole'),
    }


def quote_path(value):
    return quote(str(value), safe='')


def inventory_entry(host, include, exclude, namespace, mapping):
    if not isinstance(host, Mapping):
        raise BookmarkBuildError('Host variables must be a dictionary')
    hostname = host.get('inventory_hostname')
    if not hostname:
        raise BookmarkBuildError('inventory_hostname is missing from host variables')
    include = include or '.*'
    namespace = namespace or 'group'
    mapping = mapping or {}
    try:
        include_re = re.compile(include)
        exclude_re = re.compile(exclude) if exclude else None
    except re.error as error:
        raise BookmarkBuildError('Invalid group pattern: %s' % error) from error
    tags = []
    for group in list(host.get('group_names') or []):
        text = str(group)
        if not include_re.search(text):
            continue
        if exclude_re is not None and exclude_re.search(text):
            continue
        tag_namespace = mapping.get(text) or mapping.get(group) or namespace
        tags.append('%s:%s' % (tag_namespace, text))
    entry = {
        'external_key': str(hostname),
        'name': str(host.get('bookmark_name') or hostname),
        'host': str(host.get('ansible_host') or hostname),
        'description': str(host.get('bookmark_description') or ''),
        'tags': sorted(set(tags)),
        'links': [clean_link(link) for link in as_list(host.get('bookmark_links'), 'bookmark_links')],
        'fields': coerce_fields(host.get('bookmark_fields')),
        'checks': [clean_check(check) for check in as_list(host.get('bookmark_checks'), 'bookmark_checks')],
    }
    if host.get('bookmark_icon'):
        entry['icon'] = str(host.get('bookmark_icon'))
    if host.get('bookmark_favicon_url') is not None:
        entry['favicon_url'] = str(host['bookmark_favicon_url'])
    if host.get('bookmark_sort') is not None:
        entry['sort'] = int(host.get('bookmark_sort'))
    return entry


def as_list(value, label):
    if value is None or value == '':
        return []
    if isinstance(value, str) or not isinstance(value, Sequence):
        raise BookmarkBuildError('%s must be a list' % label)
    return list(value)


def coerce_fields(value):
    if value is None or value == '':
        return []
    if isinstance(value, Mapping):
        fields = []
        for key, item in value.items():
            if item is None:
                continue
            fields.append({'key': str(key), 'value': str(item)})
        return fields
    if isinstance(value, Sequence) and not isinstance(value, str):
        return list(value)
    raise BookmarkBuildError('bookmark_fields must be a list or a dictionary')


def clean_link(link):
    if not isinstance(link, Mapping):
        raise BookmarkBuildError('Each link must be a dictionary')
    cleaned = {
        'label': link.get('label'),
        'url_template': link.get('url_template'),
        'type': link.get('type') or 'web',
        'primary': bool(link.get('primary')),
        'sort': int(link.get('sort') or 0),
    }
    if link.get('icon'):
        cleaned['icon'] = link.get('icon')
    return cleaned


def clean_check(check):
    if not isinstance(check, Mapping):
        raise BookmarkBuildError('Each check must be a dictionary')
    cleaned = {
        'name': check.get('name'),
        'kind': check.get('kind'),
    }
    for key in (
        'executor',
        'interval_seconds',
        'timeout_ms',
        'tls_verify',
        'host',
        'port',
        'link_label',
        'method',
        'url_template',
    ):
        if check.get(key) is not None:
            cleaned[key] = check.get(key)
    return cleaned


def v1_plan(settings, bookmarks, secret_fields, namespace='group', tag_fields=None, v1_url='', checks=None,
            favicon_checks=False, favicon_overrides=None, field_min_roles=None):
    if not isinstance(settings, Mapping):
        raise BookmarkBuildError('V1 globals must be a JSON object')
    if not isinstance(bookmarks, Mapping):
        raise BookmarkBuildError('V1 bookmarks must be a JSON object')
    secrets = set(str(item) for item in (secret_fields or []))
    tag_fields = validate_tag_fields(tag_fields, secrets)
    namespace = namespace or 'group'
    populated = {key for items in (bookmarks.get('bookmarks') or {}).values()
                 for item in (items or []) if isinstance(item, Mapping)
                 for key in ('user%d' % index for index in range(1, 9))
                 if text_of(item.get(key)) != ''}
    fields = v1_field_definitions(settings, secrets, populated - set(tag_fields), field_min_roles)
    fields = [field for field in fields if field['key'] not in tag_fields]
    allowed = [field['key'] for field in fields]
    merged = {}
    order = []
    for group, items in (bookmarks.get('bookmarks') or {}).items():
        for bookmark in items or []:
            if not isinstance(bookmark, Mapping):
                continue
            external = text_of(bookmark.get('id')).strip()
            if not external:
                continue
            if external not in merged:
                order.append(external)
                merged[external] = v1_entry(bookmark, group, allowed, namespace, v1_url)
            else:
                tag = '%s:%s' % (namespace, group)
                if tag not in merged[external]['tags']:
                    merged[external]['tags'].append(tag)
                current_fields = {field['key']: field['value'] for field in merged[external]['fields']}
                for key in allowed:
                    value = text_of(bookmark.get(key))
                    if value and key not in current_fields:
                        merged[external]['fields'].append({'key': key, 'value': value})
                    elif value and current_fields.get(key) != value:
                        raise BookmarkBuildError('V1 entry %s has conflicting values for %s' % (external, key))
            for key, tag_options in tag_fields.items():
                raw = text_of(bookmark.get(key))
                parts = raw.split(tag_options['split']) if tag_options['split'] else [raw]
                tag_namespace = tag_options['namespace']
                for part in parts:
                    value = part.strip()
                    if not value:
                        continue
                    token = '%s:%s' % (tag_namespace, value) if tag_namespace else value
                    if len(token) > 200:
                        raise BookmarkBuildError('V1 tag from %s exceeds 200 characters' % key)
                    if not tag_namespace and ':' in value:
                        raise BookmarkBuildError('V1 tag column %s needs a namespace for values containing a colon' % key)
                    merged[external]['tags'].append(token)
    if not isinstance(checks or [], list) or not all(isinstance(check, Mapping) for check in checks or []):
        raise BookmarkBuildError('v1_import_checks must be a list of check definitions')
    overrides = favicon_overrides or {}
    if not isinstance(overrides, Mapping):
        raise BookmarkBuildError('v1_import_favicon_overrides must map V1 ids to URLs or empty strings')
    overrides = {str(key): value for key, value in overrides.items()}
    for entry in merged.values():
        entry['tags'] = sorted(set(entry['tags']))
        if entry['external_key'] in overrides:
            value = overrides[entry['external_key']]
            if not isinstance(value, str):
                raise BookmarkBuildError('Favicon overrides must be URLs or empty strings')
            parsed = urlparse(value)
            if value and (parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password):
                raise BookmarkBuildError('Favicon overrides must be absolute HTTP(S) URLs without credentials')
            entry['favicon_url'] = value
        entry['checks'] = [dict(check) for check in checks or []] if entry['host'] and not v1_loopback_host(entry['host']) else []
        if favicon_checks and entry['favicon_url'] and not v1_loopback_host(entry['host']):
            entry['checks'].append(dict(name='favicon', kind='image', executor='client', url_template=entry['favicon_url'], interval_seconds=60))
        names = [check.get('name') for check in entry['checks']]
        if len(names) != len(set(names)):
            raise BookmarkBuildError('Imported checks must have unique names; favicon is reserved when favicon checks are enabled')
    return {'fields': fields, 'entries': [merged[key] for key in order]}


def validate_tag_fields(tag_fields, secrets):
    if tag_fields is None:
        return {}
    if not isinstance(tag_fields, Mapping):
        raise BookmarkBuildError('v1_import_tag_fields must map user1..user8 to tag namespaces')
    normalized = {}
    for key, options in tag_fields.items():
        if key not in ['user%d' % index for index in range(1, 9)]:
            raise BookmarkBuildError('Tag field must be user1..user8')
        if key in secrets:
            raise BookmarkBuildError('A V1 column cannot be both a secret field and a tag field')
        if isinstance(options, str):
            namespace, separator = options, None
        elif isinstance(options, Mapping) and set(options) <= {'namespace', 'split'}:
            namespace, separator = options.get('namespace', ''), options.get('split')
        else:
            raise BookmarkBuildError('Tag fields need a namespace string or namespace/split options')
        if not isinstance(namespace, str) or (namespace and not re.fullmatch(r'[a-z][a-z0-9_-]{0,63}', namespace)):
            raise BookmarkBuildError('Tag namespaces must be empty or lower-case namespace names')
        if separator is not None and (not isinstance(separator, str) or not separator or len(separator) > 64):
            raise BookmarkBuildError('Tag split separators must be non-empty strings up to 64 characters')
        if namespace in ('state', 'is', 'has'):
            raise BookmarkBuildError('Tag namespace is reserved by the query language')
        normalized[key] = {'namespace': namespace, 'split': separator}
    return normalized


def v1_loopback_host(host):
    normalized = host.rstrip('.').lower()
    if normalized == 'localhost':
        return True
    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        try:
            # Numeric IPv4 shorthand is parsed locally, without DNS or network access.
            address = ipaddress.ip_address(inet_aton(normalized))
        except OSError:
            return False
    return address.is_loopback or bool(getattr(address, 'ipv4_mapped', None) and address.ipv4_mapped.is_loopback)


def v1_field_definitions(settings, secrets, populated=None, field_min_roles=None):
    roles = field_min_roles if field_min_roles is not None else {}
    if not isinstance(roles, Mapping) or any(key not in ['user%d' % i for i in range(1, 9)] or
                                             role not in ('anonymous', 'viewer', 'editor', 'admin') for key, role in roles.items()):
        raise BookmarkBuildError('v1_import_field_min_roles must map user1..user8 to anonymous/viewer/editor/admin')
    fields = []
    for index in range(1, 9):
        key = 'user%d' % index
        label = text_of(settings.get('nameU%d' % index)).strip()
        if not label and key not in secrets and key not in (populated or set()):
            continue
        hidden = text_of(settings.get('hideU%d' % index)).strip() == '1'
        field_type = 'secret' if key in secrets else 'text'
        fields.append({
            'key': key,
            'label': label or key,
            'type': field_type,
            'min_role': roles.get(key, 'viewer'),
            'searchable': field_type != 'secret',
            'show_as_column': not hidden,
            'sort': index,
        })
    return fields


def v1_entry(bookmark, group, allowed, namespace, v1_url=''):
    link = text_of(bookmark.get('link')).strip()
    links = []
    if link:
        links.append({
            'label': 'Open',
            'url_template': link,
            'type': v1_link_type(link),
            'primary': True,
            'sort': 0,
        })
    external = text_of(bookmark.get('id')).strip()
    fields = []
    for key in allowed:
        value = text_of(bookmark.get(key))
        if value:
            fields.append({'key': key, 'value': value})
    return {
        'external_key': external,
        'name': text_of(bookmark.get('name')).strip() or ('Bookmark %s' % external),
        'description': text_of(bookmark.get('remarks')),
        'host': v1_host(link),
        'icon': v1_icon(bookmark.get('favicon'), v1_url) or '',
        'favicon_url': v1_favicon_url(bookmark.get('favicon'), v1_url),
        'sort': v1_sort(bookmark.get('sort')),
        'tags': ['%s:%s' % (namespace, group)],
        'links': links,
        'fields': fields,
        'checks': [],
    }


def v1_host(link):
    parsed = urlparse(link)
    if parsed.hostname:
        return parsed.hostname
    return ''


def v1_icon(favicon, v1_url=''):
    value = text_of(favicon).strip()
    parsed = urlparse(value)
    base = urlparse(v1_url)
    if parsed.netloc and (not base.netloc or (parsed.scheme or base.scheme, parsed.netloc) != (base.scheme, base.netloc)):
        return ''
    match = ICON_RE.search(value)
    if not match:
        return ''
    return match.group(1).lower()


def v1_favicon_url(favicon, v1_url):
    value = text_of(favicon).strip()
    if not value or v1_icon(value, v1_url):
        return ''
    resolved = urljoin(v1_url.rstrip('/') + '/', value) if v1_url else value
    parsed = urlparse(resolved)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password:
        raise BookmarkBuildError('V1 favicon needs an HTTP(S) URL without credentials; set v1_url for relative paths')
    return resolved


def v1_sort(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def text_of(value):
    if value is None:
        return ''
    return str(value)


def v1_link_type(link):
    scheme = urlparse(link).scheme.lower()
    if scheme in ('http', 'https'):
        return 'web'
    return scheme if scheme in ('ssh', 'vnc', 'rdp', 'telnet') else 'other'


def resolve_entry_icon_names(module, desired):
    def resolve(ref):
        if not ref or not ref.startswith('upload-name:'):
            return ref
        matches = api(module, 'GET', '/api/v1/icons?name=' + quote_path(ref[12:])).get('icons') or []
        if len(matches) != 1:
            module.fail_json(msg='Uploaded icon name was not found: %s' % ref[12:])
        return matches[0]['ref']
    if 'iconRef' in desired:
        desired['iconRef'] = resolve(desired['iconRef'])
    for link in desired.get('links') or []:
        link['iconRef'] = resolve(link.get('iconRef'))
    return desired


def image_payload(module, src, content=None, content_type=None):
    if src:
        try:
            with open(src, 'rb') as handle:
                data = handle.read(1400001)
        except OSError as error:
            module.fail_json(msg='Cannot read image: %s' % error)
        if len(data) > 1400000:
            module.fail_json(msg='Image exceeds the upload limit')
        encoded = base64.b64encode(data).decode('ascii')
    else:
        encoded = content
        try:
            data = base64.b64decode(encoded, validate=True)
        except (ValueError, TypeError):
            module.fail_json(msg='content must be standard Base64')
    inferred = content_type or mimetypes.guess_type(src or '')[0]
    if not inferred:
        if data.startswith(b'\x89PNG'):
            inferred = 'image/png'
        elif data.startswith(b'RIFF') and data[8:12] == b'WEBP':
            inferred = 'image/webp'
        elif b'<svg' in data[:1024]:
            inferred = 'image/svg+xml'
        elif data.startswith(b'\xff\xd8\xff'):
            inferred = 'image/jpeg'
    if not inferred:
        module.fail_json(msg='Cannot infer content_type from the image')
    return {'contentType': inferred, 'data': encoded}


def build_field_value(item):
    present = [name for name in ('value', 'secret_value') if item.get(name) is not None]
    if len(present) != 1:
        raise BookmarkBuildError('Each field needs exactly one of value or secret_value')
    return {'key': item['key'], 'value': item[present[0]]}


def protect_entry_fields(module):
    # Legacy values stay conservatively protected through validation, invocation logging
    # and metadata lookup. Only known public field values are released for final output.
    groups = module.params.get('entries') or [module.params]
    if not any(item.get('fields') for item in groups):
        return
    definitions = api(module, 'GET', '/api/v1/fields').get('fields') or []
    public = {item['key'] for item in definitions if item.get('type') in ('text', 'url', 'number')}
    spec = module.argument_spec
    fields_spec = spec.get('fields') or (spec.get('entries') or {}).get('options', {}).get('fields')
    if fields_spec:
        fields_spec['options']['value']['no_log'] = False

    def explicit_secrets(options, values):
        protected = set()
        for key, option in options.items():
            value = values.get(key)
            if value is None:
                continue
            if option.get('no_log'):
                if isinstance(value, str) and value:
                    protected.add(value)
            elif option.get('options'):
                for nested in value if isinstance(value, list) else [value]:
                    if isinstance(nested, Mapping):
                        protected.update(explicit_secrets(option['options'], nested))
        return protected

    protected = explicit_secrets(spec, module.params)
    for item in groups:
        for field in item.get('fields') or []:
            if field.get('value') and field['key'] not in public:
                protected.add(field['value'])
    module.no_log_values = protected
