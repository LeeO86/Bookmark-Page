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
        v1_import_site_title: true # Optional: copy V1 name
        v1_import_site_claim: true # Optional: copy V1 claim
        v1_import_secret_fields:
          - user2
        v1_import_tag_fields:
          user3: room
          user4: type
```

The default scope is `v1-import`. A second run updates that scope and, with the default purge, removes imported entries that are gone from V1.

## What is copied

- Title (`name`) and claim (`claim`) are copied only with the respective `v1_import_site_title` and `v1_import_site_claim` options, both `false` by default. Missing keys preserve the V2 values. An explicitly empty claim clears it. Titles must contain 1–200 characters after trimming; claims allow up to 500 characters. Other settings, logos and colours are preserved.
- V1 groups become tags `group:<name>`. A bookmark in several groups becomes one entry. The external key is the V1 id.
- Remarks become the description. The link becomes one primary link named Open. The host is inferred from all URLs with a hostname. HTTP(S) stays `web`; SSH, VNC, RDP and telnet retain their protocol type.
- `nameU1` through `nameU8` become field labels. `hideU1` through `hideU8` set to `1` hides that column.
- `user1` through `user8` become field values without trimming whitespace. Populated columns without labels receive their `userN` key as a fallback label. Columns named in `v1_import_secret_fields` are secret fields.
- `v1_import_tag_fields` maps chosen columns to tag namespaces, for example `user3: room` turns `Control Room` into `room:Control Room`. Use `user4: ""` for a plain tag. Each non-empty trimmed cell becomes one tag; commas, semicolons and spaces inside the cell are preserved. Mapped columns are omitted from custom fields. Hidden columns stay fields unless explicitly mapped. A column cannot be both secret and a tag; tags are visible wherever the entry is visible.
- Group values with spaces or punctuation remain exact tags; the sidebar builds quoted-value queries such as `group:"Control Room"`.
- Changed managed links queue favicon discovery after commit; a dry run does not fetch icons.
- Legacy `img/icons/<name>.svg` references become the Lucide icon `<name>`. Other HTTP(S) favicon addresses become the entry's explicit `faviconUrl`, including device-specific paths. Relative addresses resolve against the V1 page base URL, matching their original browser meaning. An external device's `/icons/name.svg` or `/img/icons/name.svg` stays an image URL. Sort order is kept.

The explicit favicon, tag-column and optional branding migration require matching application and collection versions `2.1.0` or newer. Reimporting the same scope applies a changed mapping: previous managed field values become tags, user additions and secret fields remain intact, and a repeated import is unchanged. Existing unused field definitions are retained.

In the V2 entry editor, open **Expert options → Favicon URL or path** to change an imported address. A path such as `/vendor/icon.png` resolves on the primary link's origin; `images/icon.png` resolves relative to its page directory. Full HTTP(S) URLs and `{{host}}` are supported. Clear it for discovery. Save to queue fetching, then reload after fetching if necessary. Images are fetched and sanitised on the server and served from its local cache. A selected library/upload icon takes priority; choose **Letter or favicon** to use the fetched image.

## What is not copied

- V1 group remarks. The tag namespace label is "Group".
- V1 accounts. V1 had no authentication. Create V2 users, or sign in through OpenID Connect or a trusted header, before importing.

See `docs/ansible.md` for the role variables.
