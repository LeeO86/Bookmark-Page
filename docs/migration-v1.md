# Migrating from V1

V1 stays on the git branch `v1`. Do not point the V2 process at the V1 MySQL database. The import reads the V1 HTTP API.

## Import

Install the `leeo86.bookmarks` collection and run the `v1_import` role. It fetches `<v1_url>/php/getGlobal.php` and `<v1_url>/php/getBookmarks.php`.

```yaml
- hosts: localhost
  gather_facts: false
  roles:
    - role: leeo86.bookmarks.v1_import
      vars:
        api_url: https://bookmarks.example.com
        api_token: "{{ lookup('ansible.builtin.env', 'BOOKMARKS_API_TOKEN') }}"
        v1_url: http://old-bookmarks.example.com
        v1_import_secret_fields:
          - user2
```

The default scope is `v1-import`. A second run updates that scope and, with the default purge, removes imported entries that are gone from V1.

## What is copied

- V1 groups become tags `group:<name>`. A bookmark in several groups becomes one entry. The external key is the V1 id.
- Remarks become the description. The link becomes one primary link named Open. The host is inferred from all URLs with a hostname. HTTP(S) stays `web`; SSH, VNC, RDP and telnet retain their protocol type.
- `nameU1` through `nameU8` become field labels. `hideU1` through `hideU8` set to `1` hides that column.
- `user1` through `user8` become field values without trimming whitespace. Populated columns without labels receive their `userN` key as a fallback label. Columns named in `v1_import_secret_fields` are secret fields.
- Group values with spaces or punctuation remain exact tags; the sidebar builds quoted-value queries such as `group:"Control Room"`.
- Changed managed links queue favicon discovery after commit; a dry run does not fetch icons.
- `img/icons/<name>.svg` becomes the Lucide icon `<name>`. Sort order is kept.

## What is not copied

- V1 group remarks. The tag namespace label is "Group".
- Favicon URLs that are not `img/icons/<name>.svg`. V2 fetches a favicon from the primary link instead.
- V1 accounts. V1 had no authentication. Create V2 users, or sign in through OpenID Connect or a trusted header, before importing.

See `docs/ansible.md` for the role variables.
