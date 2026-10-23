from django.test import TestCase, Client
from django.urls import reverse
from django.http import Http404
from .models import Note
from .views import apply_strikethrough, process_markdown_links
import uuid


class NoteModelTests(TestCase):
    """Test cases for the Note model"""

    def test_note_creation(self):
        """Test that a note is created successfully"""
        note = Note.objects.create(content="Test content")
        self.assertIsNotNone(note.hashcode)
        self.assertIsNotNone(note.edit_token)
        self.assertEqual(note.content, "Test content")
        self.assertEqual(len(note.hashcode), 8)  # Short 8-char hashcode
        self.assertEqual(len(note.edit_token), 32)

    def test_note_hashcode_uniqueness(self):
        """Test that each note gets a unique hashcode"""
        note1 = Note.objects.create(content="Content 1")
        note2 = Note.objects.create(content="Content 2")
        self.assertNotEqual(note1.hashcode, note2.hashcode)
        self.assertNotEqual(note1.edit_token, note2.edit_token)

    def test_note_str_representation(self):
        """Test the string representation of a note"""
        note = Note.objects.create(content="Test")
        expected = f"Note {note.hashcode}"
        self.assertEqual(str(note), expected)

    def test_note_auto_timestamps(self):
        """Test that timestamps are automatically set"""
        note = Note.objects.create(content="Test")
        self.assertIsNotNone(note.created_at)
        self.assertIsNotNone(note.updated_at)

    def test_note_update_timestamp(self):
        """Test that updated_at changes on save"""
        note = Note.objects.create(content="Original")
        original_updated = note.updated_at
        note.content = "Updated"
        note.save()
        self.assertGreater(note.updated_at, original_updated)

    def test_custom_hashcode_preserved(self):
        """Test that custom hashcode is preserved if provided"""
        custom_hash = "custom123456789012345678901234"
        note = Note(content="Test", hashcode=custom_hash)
        note.save()
        self.assertEqual(note.hashcode, custom_hash)

    def test_custom_edit_token_preserved(self):
        """Test that custom edit token is preserved if provided"""
        custom_token = "token1234567890123456789012345678901234567890123456789012"
        note = Note(content="Test", edit_token=custom_token)
        note.save()
        self.assertEqual(note.edit_token, custom_token)


class HelperFunctionsTests(TestCase):
    """Test cases for helper functions"""

    def test_apply_strikethrough_basic(self):
        """Test basic strikethrough conversion"""
        text = "This is ~~deleted~~ text"
        result = apply_strikethrough(text)
        self.assertEqual(result, "This is <del>deleted</del> text")

    def test_apply_strikethrough_multiple(self):
        """Test multiple strikethroughs in one text"""
        text = "~~First~~ and ~~Second~~"
        result = apply_strikethrough(text)
        self.assertEqual(result, "<del>First</del> and <del>Second</del>")

    def test_apply_strikethrough_multiline(self):
        """Test strikethrough across multiple lines"""
        text = "~~Line one\nLine two~~"
        result = apply_strikethrough(text)
        self.assertEqual(result, "<del>Line one\nLine two</del>")

    def test_apply_strikethrough_no_match(self):
        """Test text without strikethrough remains unchanged"""
        text = "Normal text without strikethrough"
        result = apply_strikethrough(text)
        self.assertEqual(result, text)

    def test_process_markdown_links_target_self(self):
        """Test that links get target _self by default"""
        html = '<a href="http://example.com">Link</a>'
        result = process_markdown_links(html)
        self.assertIn('target="_self"', result)
        self.assertIn('rel="noopener noreferrer"', result)

    def test_process_markdown_links_target_blank(self):
        """Test that links get target _blank when specified"""
        html = '<a href="http://example.com">Link</a>'
        result = process_markdown_links(html, target='_blank')
        self.assertIn('target="_blank"', result)
        self.assertIn('rel="noopener noreferrer"', result)

    def test_process_markdown_links_youtube_short(self):
        """Test YouTube short URL conversion to embed"""
        html = '<p><a href="https://youtu.be/dQw4w9WgXcQ">Video</a></p>'
        result = process_markdown_links(html)
        self.assertIn('<iframe', result)
        self.assertIn('youtube.com/embed/dQw4w9WgXcQ', result)
        self.assertIn('width="560"', result)
        self.assertIn('height="315"', result)

    def test_process_markdown_links_youtube_plain(self):
        """Test plain YouTube URL conversion to embed"""
        html = '<p>https://youtu.be/dQw4w9WgXcQ</p>'
        result = process_markdown_links(html)
        self.assertIn('<iframe', result)
        self.assertIn('youtube.com/embed/dQw4w9WgXcQ', result)

    def test_process_markdown_links_youtube_www(self):
        """Test www.youtu.be URL handling"""
        html = '<p><a href="https://www.youtu.be/abc123">Video</a></p>'
        result = process_markdown_links(html)
        self.assertIn('youtube.com/embed/abc123', result)

    def test_process_markdown_links_no_youtube(self):
        """Test regular links are not converted to iframe"""
        html = '<a href="http://example.com">Regular Link</a>'
        result = process_markdown_links(html)
        self.assertNotIn('<iframe', result)
        self.assertIn('example.com', result)


class ViewsTests(TestCase):
    """Test cases for views"""

    def setUp(self):
        """Set up test client and sample note"""
        self.client = Client()
        self.note = Note.objects.create(content="# Test Note\n\nThis is test content.")
        # Create a user so the home view doesn't redirect to setup
        from django.contrib.auth.models import User
        self.user = User.objects.create_user(username='testuser', password='testpassword')

    def test_home_redirects_to_setup_if_no_users(self):
        """Test home view redirects to setup if no users exist"""
        from django.contrib.auth.models import User
        User.objects.all().delete()
        response = self.client.get(reverse('home'))
        self.assertRedirects(response, reverse('setup_admin'))

    def test_home_view(self):
        """Test home view returns correct template when user exists"""
        response = self.client.get(reverse('home'))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'tapnote/editor.html')

    def test_home_editor_has_formatting_toolbar(self):
        """New notes expose every basic formatting button."""
        response = self.client.get(reverse('home'))
        self.assertContains(response, 'data-format-toolbar')
        for fmt in ['bold', 'italic', 'underline',
                    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                    'ul', 'ol', 'link']:
            self.assertContains(response, f'data-format="{fmt}"')

    def test_theme_toggle_on_editor_and_note_pages(self):
        """The theme switch is available in the editor and on public notes."""
        home = self.client.get(reverse('home'))
        self.assertContains(home, 'data-theme-toggle')
        self.assertContains(home, 'js/theme.js')

        public_view = self.client.get(reverse('view_note', args=[self.note.hashcode]))
        self.assertContains(public_view, 'data-theme-toggle')

        self.client.cookies[f'edit_token_{self.note.hashcode}'] = self.note.edit_token
        editable_view = self.client.get(reverse('view_note', args=[self.note.hashcode]))
        html = editable_view.content.decode()
        self.assertIn('data-theme-toggle', html)
        self.assertLess(html.index('data-theme-toggle'), html.index('Backup Edit Link'))

    def test_publish_view_get_redirects(self):
        """Test GET request to publish redirects to home"""
        response = self.client.get(reverse('publish'))
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('home'))

    def test_publish_view_post_creates_note(self):
        """Test POST to publish creates a new note"""
        initial_count = Note.objects.count()
        response = self.client.post(reverse('publish'), {'content': 'New note content'})
        self.assertEqual(Note.objects.count(), initial_count + 1)
        self.assertEqual(response.status_code, 302)
        
        new_note = Note.objects.latest('created_at')
        self.assertEqual(new_note.content, 'New note content')
        self.assertRedirects(response, reverse('view_note', args=[new_note.hashcode]))

    def test_publish_view_post_sets_cookie(self):
        """Test that publish sets edit token cookie"""
        response = self.client.post(reverse('publish'), {'content': 'Test content'})
        note = Note.objects.latest('created_at')
        cookie_name = f'edit_token_{note.hashcode}'
        self.assertIn(cookie_name, response.cookies)
        self.assertEqual(response.cookies[cookie_name].value, note.edit_token)

    def test_publish_view_empty_content_redirects(self):
        """Test publishing empty content redirects to home"""
        response = self.client.post(reverse('publish'), {'content': ''})
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('home'))

    def test_publish_view_content_too_long_redisplays_form(self):
        """An oversized draft shows the error on the publish form, not a 500."""
        response = self.client.post(reverse('publish'), {'content': 'x' * 200001})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'Content exceeds the limit')
        self.assertContains(response, 'action="/publish/"')

    def test_view_note_success(self):
        """Test viewing a note works correctly"""
        response = self.client.get(reverse('view_note', args=[self.note.hashcode]))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'tapnote/view_note.html')
        self.assertIn('note', response.context)
        self.assertIn('content', response.context)
        self.assertEqual(response.context['note'], self.note)

    def test_view_note_invalid_hashcode_404(self):
        """Test viewing non-existent note returns 404"""
        response = self.client.get(reverse('view_note', args=['invalidhash']))
        self.assertEqual(response.status_code, 404)

    def test_view_note_markdown_rendering(self):
        """Test that markdown is properly rendered in view"""
        response = self.client.get(reverse('view_note', args=[self.note.hashcode]))
        html_content = response.context['content']
        self.assertIn('<h1>Test Note</h1>', html_content)
        self.assertIn('<p>This is test content.</p>', html_content)

    def test_view_note_can_edit_with_cookie(self):
        """Test can_edit flag is True with correct cookie"""
        self.client.cookies[f'edit_token_{self.note.hashcode}'] = self.note.edit_token
        response = self.client.get(reverse('view_note', args=[self.note.hashcode]))
        self.assertTrue(response.context['can_edit'])

    def test_view_note_can_edit_with_token_param(self):
        """Test can_edit flag is True with token parameter"""
        url = reverse('view_note', args=[self.note.hashcode]) + f'?token={self.note.edit_token}'
        response = self.client.get(url)
        self.assertTrue(response.context['can_edit'])

    def test_view_note_cannot_edit_without_token(self):
        """Test can_edit flag is False without token"""
        response = self.client.get(reverse('view_note', args=[self.note.hashcode]))
        self.assertFalse(response.context['can_edit'])

    def test_view_note_strikethrough(self):
        """Test strikethrough rendering in view"""
        note = Note.objects.create(content="~~Deleted text~~")
        response = self.client.get(reverse('view_note', args=[note.hashcode]))
        self.assertIn('<del>Deleted text</del>', response.context['content'])

    def test_view_note_footnotes(self):
        """Test footnote rendering in view"""
        content = "Here is a footnote reference[^1]\n\n[^1]: Here is the footnote."
        note = Note.objects.create(content=content)
        response = self.client.get(reverse('view_note', args=[note.hashcode]))
        html = response.context['content']
        
        # Check for footnote reference link
        self.assertIn('sup id="fnref:1"', html)
        self.assertIn('href="#fn:1"', html)
        
        # Check for footnote definition at the bottom
        self.assertIn('div class="footnote"', html)
        self.assertIn('id="fn:1"', html)
        self.assertIn('Here is the footnote', html)

    def test_view_note_page_title_uses_first_heading(self):
        """Browser tab title is "<heading> • scrbl" for an untitled note."""
        note = Note.objects.create(content="# A Heading\n\nBody text.")
        response = self.client.get(reverse('view_note', args=[note.hashcode]))
        self.assertEqual(response.context['page_title'], 'A Heading \u2022 scrbl')
        self.assertIn('<title>A Heading \u2022 scrbl</title>', response.content.decode())

    def test_view_note_page_title_prefers_explicit_title(self):
        """An explicit note title wins over a heading in the content."""
        note = Note.objects.create(
            title='Explicit Title',
            content='# Body Heading\n\nBody text.',
        )
        response = self.client.get(reverse('view_note', args=[note.hashcode]))
        self.assertEqual(response.context['page_title'], 'Explicit Title \u2022 scrbl')
        self.assertIn('<title>Explicit Title \u2022 scrbl</title>', response.content.decode())

    def test_view_note_page_title_falls_back_to_scrbl(self):
        """An empty note falls back to the plain brand title."""
        note = Note.objects.create(content='')
        response = self.client.get(reverse('view_note', args=[note.hashcode]))
        self.assertEqual(response.context['page_title'], 'scrbl')
        self.assertIn('<title>scrbl</title>', response.content.decode())

    def test_edit_note_get_with_valid_cookie(self):
        """Test GET request to edit with valid cookie"""
        self.client.cookies[f'edit_token_{self.note.hashcode}'] = self.note.edit_token
        response = self.client.get(reverse('edit_note', args=[self.note.hashcode]))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'tapnote/editor.html')
        self.assertEqual(response.context['note'], self.note)
        self.assertContains(response, 'data-format-toolbar')

    def test_view_note_has_no_formatting_toolbar(self):
        """The toolbar belongs to the editor, not the published note."""
        response = self.client.get(reverse('view_note', args=[self.note.hashcode]))
        self.assertNotContains(response, 'data-format-toolbar')

    def test_edit_note_get_with_url_token(self):
        """Test GET request to edit with URL token"""
        url = reverse('edit_note', args=[self.note.hashcode]) + f'?token={self.note.edit_token}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, 'tapnote/editor.html')

    def test_edit_note_get_without_token_404(self):
        """Test GET request to edit without token returns 404"""
        response = self.client.get(reverse('edit_note', args=[self.note.hashcode]))
        self.assertEqual(response.status_code, 404)

    def test_edit_note_get_with_wrong_token_404(self):
        """Test GET request to edit with wrong token returns 404"""
        self.client.cookies[f'edit_token_{self.note.hashcode}'] = 'wrongtoken'
        response = self.client.get(reverse('edit_note', args=[self.note.hashcode]))
        self.assertEqual(response.status_code, 404)

    def test_edit_note_post_updates_content(self):
        """Test POST request updates note content"""
        self.client.cookies[f'edit_token_{self.note.hashcode}'] = self.note.edit_token
        new_content = "Updated content"
        response = self.client.post(
            reverse('edit_note', args=[self.note.hashcode]),
            {'content': new_content}
        )
        self.note.refresh_from_db()
        self.assertEqual(self.note.content, new_content)
        self.assertRedirects(response, reverse('view_note', args=[self.note.hashcode]))

    def test_edit_note_post_empty_content_no_update(self):
        """Test POST with empty content doesn't update"""
        self.client.cookies[f'edit_token_{self.note.hashcode}'] = self.note.edit_token
        original_content = self.note.content
        response = self.client.post(
            reverse('edit_note', args=[self.note.hashcode]),
            {'content': ''}
        )
        self.note.refresh_from_db()
        self.assertEqual(self.note.content, original_content)

    def test_edit_note_invalid_hashcode_404(self):
        """Test editing non-existent note returns 404"""
        response = self.client.get(reverse('edit_note', args=['invalidhash']))
        self.assertEqual(response.status_code, 404)

    def test_handler404(self):
        """Test custom 404 handler"""
        from .views import handler404
        response = self.client.get('/nonexistent-url/')
        self.assertEqual(response.status_code, 404)


class PreviewNoteTests(TestCase):
    """Tests for the live editor preview endpoint."""

    def setUp(self):
        self.client = Client()

    def test_preview_renders_markdown(self):
        """Preview uses the same markdown pipeline as the note page."""
        response = self.client.post(reverse('preview_note'), {
            'content': '# Heading\n\nSome **bold** text and ~~deleted~~ text.',
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data['ok'])
        self.assertIn('<h1>Heading</h1>', data['html'])
        self.assertIn('<strong>bold</strong>', data['html'])
        self.assertIn('<del>deleted</del>', data['html'])
        self.assertIn('markdown-content', data['html'])

    def test_preview_renders_underline_html(self):
        """The underline button emits raw <u> HTML, which is kept by markdown."""
        response = self.client.post(reverse('preview_note'), {
            'content': 'This is <u>underlined</u> text.',
        })
        self.assertIn('<u>underlined</u>', response.json()['html'])

    def test_preview_includes_title_and_author(self):
        """The preview header mirrors the published note header."""
        response = self.client.post(reverse('preview_note'), {
            'content': 'Body text.',
            'title': 'My Title',
            'author': 'Ada',
        })
        html = response.json()['html']
        self.assertIn('My Title', html)
        self.assertIn('Ada', html)

    def test_preview_escapes_title_and_author(self):
        """Title and author are escaped, not injected into the preview."""
        response = self.client.post(reverse('preview_note'), {
            'content': 'Body text.',
            'title': '<script>alert(1)</script>',
            'author': '<b>Ada</b>',
        })
        html = response.json()['html']
        self.assertNotIn('<script>alert(1)</script>', html)
        self.assertNotIn('<b>Ada</b>', html)
        self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;', html)

    def test_preview_shows_header_without_content(self):
        """A title can be previewed before any body text is written."""
        response = self.client.post(reverse('preview_note'), {
            'content': '',
            'title': 'Only A Title',
        })
        html = response.json()['html']
        self.assertIn('Only A Title', html)
        self.assertIn('markdown-content', html)

    def test_preview_does_not_create_a_note(self):
        """Previewing is read-only and must not persist anything."""
        before = Note.objects.count()
        self.client.post(reverse('preview_note'), {'content': 'Draft text.'})
        self.assertEqual(Note.objects.count(), before)

    def test_preview_rejects_get(self):
        """The preview endpoint only accepts POST."""
        response = self.client.get(reverse('preview_note'))
        self.assertEqual(response.status_code, 405)

    def test_preview_rejects_oversized_content(self):
        """Oversized drafts are rejected like the publish form."""
        response = self.client.post(reverse('preview_note'), {
            'content': 'x' * 200001,
        })
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.json()['ok'])


class IntegrationTests(TestCase):
    """Integration tests for complete workflows"""

    def setUp(self):
        """Set up test client"""
        self.client = Client()

    def test_complete_note_lifecycle(self):
        """Test creating, viewing, and editing a note"""
        # Create note
        create_response = self.client.post(reverse('publish'), {'content': 'Initial content'})
        self.assertEqual(create_response.status_code, 302)
        
        # Get the created note
        note = Note.objects.latest('created_at')
        
        # View note
        view_response = self.client.get(reverse('view_note', args=[note.hashcode]))
        self.assertEqual(view_response.status_code, 200)
        
        # Edit note with cookie set from creation
        edit_response = self.client.post(
            reverse('edit_note', args=[note.hashcode]),
            {'content': 'Updated content'}
        )
        self.assertEqual(edit_response.status_code, 302)
        
        # Verify update
        note.refresh_from_db()
        self.assertEqual(note.content, 'Updated content')

    def test_markdown_features_integration(self):
        """Test various markdown features work together"""
        content = """# Heading
        
**Bold** and *italic*

- List item 1
- List item 2

~~Strikethrough~~

```python
def hello():
    print("Hello")
```

[Link](http://example.com)

https://youtu.be/test123
"""
        note = Note.objects.create(content=content)
        response = self.client.get(reverse('view_note', args=[note.hashcode]))
        html = response.context['content']
        
        # Check various elements are rendered
        self.assertIn('<h1>Heading</h1>', html)
        self.assertIn('<strong>Bold</strong>', html)
        self.assertIn('<em>italic</em>', html)
        self.assertIn('<li>List item', html)
        self.assertIn('<del>Strikethrough</del>', html)
        self.assertIn('<code', html)
        self.assertIn('target="_self"', html)  # Default link target is _self
        self.assertIn('youtube.com/embed/test123', html)


class BanTests(TestCase):
    """Test cases for ban functionality"""

    def setUp(self):
        from django.contrib.auth.models import User
        self.admin = User.objects.create_superuser(username='admin', password='password', email='admin@example.com')
        self.user = User.objects.create_user(username='user', password='password')
        self.client = Client()

    def test_admin_can_ban_user(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            reverse('api_ban'),
            {'siteId': 'test_site', 'targetUserId': 'bad_user', 'reason': 'spam'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['success'])
        
        # Verify ban exists
        response = self.client.get(reverse('api_ban'), {'siteId': 'test_site'})
        data = response.json()
        self.assertEqual(len(data['bannedUsers']), 1)
        self.assertEqual(data['bannedUsers'][0]['userId'], 'bad_user')

    def test_admin_can_unban_user(self):
        self.client.force_login(self.admin)
        # First ban
        self.client.post(
            reverse('api_ban'),
            {'siteId': 'test_site', 'targetUserId': 'bad_user'},
            content_type='application/json'
        )
        
        # Then unban
        response = self.client.delete(
            reverse('api_ban'),
            {'siteId': 'test_site', 'targetUserId': 'bad_user'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        
        # Verify ban is gone
        response = self.client.get(reverse('api_ban'), {'siteId': 'test_site'})
        data = response.json()
        self.assertEqual(len(data['bannedUsers']), 0)

    def test_non_admin_cannot_ban(self):
        self.client.force_login(self.user)
        response = self.client.post(
            reverse('api_ban'),
            {'siteId': 'test_site', 'targetUserId': 'bad_user'},
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 403)

    def test_banned_user_cannot_comment(self):
        # Ban a specific IP user ID
        site_id = 'test_site'
        import hashlib
        # Simulate IP hash generation
        ip = '127.0.0.1' 
        ip_hash = hashlib.md5((ip + site_id).encode()).hexdigest()
        user_id = f"ip_{ip_hash}"
        
        from .models import BannedUser
        BannedUser.objects.create(site_id=site_id, user_id=user_id)
        
        # Try to comment
        response = self.client.post(
            reverse('api_comments'),
            {
                'siteId': site_id,
                'workId': 'work1',
                'chapterId': 'ch1',
                'paraIndex': 0,
                'content': 'Spam content'
            },
            content_type='application/json'
        )
        
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['error'], 'user_banned')
