import markdown
import json
import hashlib
from django.shortcuts import render, get_object_or_404, redirect
from django.template.loader import render_to_string
from django.http import Http404, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.dateparse import parse_datetime
from django.contrib.auth.models import User
from django.contrib.auth import login
from django.db import models
from django.conf import settings
from .models import Note, Comment, LikeRecord, BannedUser, TelegraphAccount
from .telegraph import nodes_to_markdown, markdown_to_nodes
from .fonts import DEFAULT_FONT, FONTS, font_options, normalize_font
import re
import secrets

MAX_CONTENT_LENGTH = 200000
MAX_COMMENT_LENGTH = 10000  # Maximum comment length
MAX_CONTEXT_TEXT_LENGTH = 100  # Maximum context fingerprint length
MAX_ID_LENGTH = 100  # Maximum ID field length
MAX_PARA_INDEX = 100000  # Maximum paragraph index (DoS guard)

def constant_time_compare(val1, val2):
    """Constant-time string comparison to prevent timing attacks."""
    if len(val1) != len(val2):
        return False
    result = 0
    for x, y in zip(val1, val2):
        result |= ord(x) ^ ord(y)
    return result == 0

def validate_id_field(value, field_name, max_length=MAX_ID_LENGTH):
    """Validate ID field format and length."""
    if not value or not isinstance(value, str):
        return False
    if len(value) > max_length:
        return False
    # Allow alphanumeric, dash, underscore, and dot
    if not re.match(r'^[a-zA-Z0-9._-]+$', value):
        return False
    return True

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

@csrf_exempt
def api_comments(request):
    if not settings.ENABLE_COMMENTS:
        return JsonResponse({'error': 'Comments are disabled'}, status=403)
        
    if request.method == 'GET':
        site_id = request.GET.get('siteId')
        work_id = request.GET.get('workId')
        chapter_id = request.GET.get('chapterId')
        
        if not all([site_id, work_id, chapter_id]):
            return JsonResponse({'error': 'missing_params'}, status=400)
        
        # Validate ID fields
        if not validate_id_field(site_id, 'siteId') or \
           not validate_id_field(work_id, 'workId') or \
           not validate_id_field(chapter_id, 'chapterId'):
            return JsonResponse({'error': 'invalid_id_format'}, status=400)
            
        comments = Comment.objects.filter(site_id=site_id, work_id=work_id, chapter_id=chapter_id).order_by('created_at')
        
        # Determine current user identity for "liked" status
        current_user_id = None
        ip = get_client_ip(request)
        if ip:
             # Same logic as creation
             ip_hash = hashlib.md5((ip + site_id).encode()).hexdigest()
             current_user_id = f"ip_{ip_hash}"

        # Get set of comment IDs liked by this user
        liked_comment_ids = set()
        if current_user_id:
            liked_comment_ids = set(
                LikeRecord.objects.filter(user_id=current_user_id, comment__in=comments)
                .values_list('comment_id', flat=True)
            )
        
        # Group by para_index
        comments_by_para = {}
        for c in comments:
            idx = str(c.para_index)
            if idx not in comments_by_para:
                comments_by_para[idx] = []
            
            comments_by_para[idx].append({
                'id': c.id,
                'paraIndex': c.para_index,
                'content': c.content,
                'userName': c.user_name,
                'userId': c.user_id,
                'userAvatar': c.user_avatar,
                'createdAt': c.created_at.isoformat(),
                'likes': c.likes,
                'contextText': c.context_text,
                'isLiked': c.id in liked_comment_ids
            })
            
        return JsonResponse({'commentsByPara': comments_by_para})

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            site_id = data.get('siteId')
            work_id = data.get('workId')
            chapter_id = data.get('chapterId')
            para_index = data.get('paraIndex')
            content = data.get('content')
            context_text = data.get('contextText')
            
            # Input validation
            if not all([site_id, work_id, chapter_id]) or para_index is None or not content:
                return JsonResponse({'error': 'missing_fields'}, status=400)
            
            # Validate ID fields
            if not validate_id_field(site_id, 'siteId') or \
               not validate_id_field(work_id, 'workId') or \
               not validate_id_field(chapter_id, 'chapterId'):
                return JsonResponse({'error': 'invalid_id_format'}, status=400)
            
            # Validate para_index
            if not isinstance(para_index, int) or para_index < 0 or para_index > MAX_PARA_INDEX:
                return JsonResponse({'error': 'invalid_para_index'}, status=400)
            
            # Validate content length
            if not isinstance(content, str) or len(content.strip()) == 0:
                return JsonResponse({'error': 'empty_content'}, status=400)
            if len(content) > MAX_COMMENT_LENGTH:
                return JsonResponse({'error': 'content_too_long'}, status=400)
            
            # Validate context_text if provided
            if context_text and (not isinstance(context_text, str) or len(context_text) > MAX_CONTEXT_TEXT_LENGTH):
                return JsonResponse({'error': 'invalid_context_text'}, status=400)
            
            # Sanitize content (strip whitespace)
            content = content.strip()
            if context_text:
                context_text = context_text.strip()
                
            # Identity logic
            DEFAULT_ANONYMOUS_NAME = "Anonymous"
            GUEST_NAME_PREFIX = "Guest-"
            
            user_name = DEFAULT_ANONYMOUS_NAME
            user_id = None
            ip = get_client_ip(request)
            
            if ip:
                ip_hash = hashlib.md5((ip + site_id).encode()).hexdigest()
                user_id = f"ip_{ip_hash}"
                user_name = f"{GUEST_NAME_PREFIX}{ip_hash[:6]}"
            
            # Check if user is banned
            if user_id and BannedUser.objects.filter(site_id=site_id, user_id=user_id).exists():
                return JsonResponse({'error': 'user_banned', 'message': 'You are banned from commenting.'}, status=403)
            
            comment = Comment.objects.create(
                site_id=site_id,
                work_id=work_id,
                chapter_id=chapter_id,
                para_index=para_index,
                content=content,
                user_name=user_name,
                user_id=user_id,
                context_text=context_text,
                ip=ip
            )
            
            return JsonResponse({
                'id': comment.id,
                'paraIndex': comment.para_index,
                'content': comment.content,
                'userName': comment.user_name,
                'userId': comment.user_id,
                'createdAt': comment.created_at.isoformat(),
                'likes': comment.likes
            }, status=201)
            
        except json.JSONDecodeError:
            return JsonResponse({'error': 'invalid_json'}, status=400)
        except Exception as e:
            # Don't expose internal error details
            return JsonResponse({'error': 'internal_error'}, status=500)

    elif request.method == 'DELETE':
        try:
            data = json.loads(request.body)
            comment_id = data.get('commentId')
            work_id = data.get('workId')  # work_id is the note hashcode
            site_id = data.get('siteId')
            chapter_id = data.get('chapterId')
            
            if not comment_id:
                return JsonResponse({'error': 'missing_fields'}, status=400)
            
            # Validate comment_id is numeric
            try:
                comment_id = int(comment_id)
            except (ValueError, TypeError):
                return JsonResponse({'error': 'invalid_comment_id'}, status=400)
            
            comment = get_object_or_404(Comment, id=comment_id)
            
            # Verify comment belongs to the requested work/chapter if provided
            if work_id and comment.work_id != work_id:
                return JsonResponse({'error': 'comment_mismatch'}, status=400)
            if site_id and comment.site_id != site_id:
                return JsonResponse({'error': 'comment_mismatch'}, status=400)
            if chapter_id and comment.chapter_id != chapter_id:
                return JsonResponse({'error': 'comment_mismatch'}, status=400)
            
            # Check if user is admin
            is_admin = request.user.is_staff
            
            # Check if user is the note author (using constant-time comparison)
            is_author = False
            if work_id and validate_id_field(work_id, 'workId', max_length=32):
                try:
                    note = Note.objects.get(hashcode=work_id)
                    # Check edit token from cookie or request (constant-time comparison)
                    edit_token = request.COOKIES.get(f'edit_token_{work_id}') or data.get('editToken')
                    if edit_token and constant_time_compare(str(edit_token), str(note.edit_token)):
                        is_author = True
                except Note.DoesNotExist:
                    pass
            
            # Allow deletion if user is admin or author
            if not (is_admin or is_author):
                return JsonResponse({'error': 'permission_denied'}, status=403)
            
            Comment.objects.filter(id=comment_id).delete()
            return JsonResponse({'success': True})
        except json.JSONDecodeError:
            return JsonResponse({'error': 'invalid_json'}, status=400)
        except Exception as e:
            # Don't expose internal error details
            return JsonResponse({'error': 'internal_error'}, status=500)
    
    return JsonResponse({'error': 'method not allowed'}, status=405)

@csrf_exempt
def api_like_comment(request):
    if not settings.ENABLE_COMMENTS:
        return JsonResponse({'error': 'Comments are disabled'}, status=403)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            comment_id = data.get('commentId')
            site_id = data.get('siteId')
            
            if not comment_id or not site_id:
                 return JsonResponse({'error': 'missing_fields'}, status=400)
            
            # Validate site_id format
            if not validate_id_field(site_id, 'siteId'):
                return JsonResponse({'error': 'invalid_id_format'}, status=400)
            
            # Validate comment_id is numeric
            try:
                comment_id = int(comment_id)
            except (ValueError, TypeError):
                return JsonResponse({'error': 'invalid_comment_id'}, status=400)

            comment = get_object_or_404(Comment, id=comment_id)
            
            # Verify comment belongs to the requested site
            if comment.site_id != site_id:
                return JsonResponse({'error': 'comment_mismatch'}, status=400)
            
            # Identity logic
            ip = get_client_ip(request)
            user_id = None
            
            if ip:
                ip_hash = hashlib.md5((ip + site_id).encode()).hexdigest()
                user_id = f"ip_{ip_hash}"
            
            if not user_id:
                 return JsonResponse({'error': 'cannot_identify_user'}, status=400)

            # Check if already liked
            if LikeRecord.objects.filter(comment=comment, user_id=user_id).exists():
                return JsonResponse({'error': 'already_liked', 'likes': comment.likes}, status=400)
            
            # Create record and increment
            try:
                LikeRecord.objects.create(comment=comment, user_id=user_id, ip=ip)
                comment.likes += 1
                comment.save()
            except Exception as e:
                # Handle race condition or unique constraint violation
                return JsonResponse({'error': 'already_liked', 'likes': comment.likes}, status=400)
            
            return JsonResponse({'likes': comment.likes})
        except json.JSONDecodeError:
            return JsonResponse({'error': 'invalid_json'}, status=400)
        except Exception as e:
            # Don't expose internal error details
            return JsonResponse({'error': 'internal_error'}, status=500)
    return JsonResponse({'error': 'method_not_allowed'}, status=405)

@csrf_exempt
def api_ban(request):
    if not settings.ENABLE_COMMENTS:
        return JsonResponse({'error': 'Comments are disabled'}, status=403)

    # Only staff (admins) can manage bans for now
    if not request.user.is_staff:
        return JsonResponse({'error': 'permission_denied', 'message': 'Admins only'}, status=403)

    if request.method == 'GET':
        site_id = request.GET.get('siteId')
        if not site_id:
             return JsonResponse({'error': 'missing_params'}, status=400)
        
        bans = BannedUser.objects.filter(site_id=site_id)
        data = []
        for ban in bans:
            data.append({
                'userId': ban.user_id,
                'reason': ban.reason,
                'bannedBy': ban.banned_by,
                'bannedAt': ban.created_at.isoformat()
            })
        return JsonResponse({'bannedUsers': data})

    elif request.method == 'POST':
        try:
            data = json.loads(request.body)
            site_id = data.get('siteId')
            target_user_id = data.get('targetUserId')
            reason = data.get('reason', '')
            
            if not site_id or not target_user_id:
                return JsonResponse({'error': 'missing_fields'}, status=400)
            
            BannedUser.objects.get_or_create(
                site_id=site_id,
                user_id=target_user_id,
                defaults={
                    'reason': reason,
                    'banned_by': request.user.username
                }
            )
            return JsonResponse({'success': True})
        except json.JSONDecodeError:
            return JsonResponse({'error': 'invalid_json'}, status=400)
        except Exception as e:
             return JsonResponse({'error': 'internal_error'}, status=500)

    elif request.method == 'DELETE':
        try:
            data = json.loads(request.body)
            site_id = data.get('siteId')
            target_user_id = data.get('targetUserId')
            
            if not site_id or not target_user_id:
                return JsonResponse({'error': 'missing_fields'}, status=400)
                
            deleted, _ = BannedUser.objects.filter(site_id=site_id, user_id=target_user_id).delete()
            if deleted:
                return JsonResponse({'success': True})
            else:
                return JsonResponse({'error': 'not_found'}, status=404)
        except json.JSONDecodeError:
            return JsonResponse({'error': 'invalid_json'}, status=400)
        except Exception:
             return JsonResponse({'error': 'internal_error'}, status=500)

    return JsonResponse({'error': 'method_not_allowed'}, status=405)

def apply_strikethrough(md_text):
    # Replace ~~something~~ with <del>something</del>
    pattern = re.compile(r'~~(.*?)~~', re.DOTALL)
    return pattern.sub(r'<del>\1</del>', md_text)

def process_markdown_links(html_content, target="_self"):
    # Keep existing link processing
    pattern = r'<a(.*?)href="(.*?)"(.*?)>'
    replacement = f'<a\\1href="\\2"\\3 target="{target}" rel="noopener noreferrer">'
    html_content = re.sub(pattern, replacement, html_content)

    # Existing anchor-based YouTube embed:
    anchor_yt_pattern = r'<p><a href="https?://(?:www\.)?youtu\.be/([^"]+)".*?>.*?</a></p>'
    anchor_yt_replacement = (
        r'<iframe width="560" height="315" '
        r'src="https://www.youtube.com/embed/\1" '
        r'frameborder="0" allowfullscreen></iframe>'
    )
    html_content = re.sub(anchor_yt_pattern, anchor_yt_replacement, html_content)

    # **Added** plain-text YouTube embed (no anchor tag):
    plain_yt_pattern = r'<p>https?://(?:www\.)?youtu\.be/([^<]+)</p>'
    plain_yt_replacement = (
        r'<iframe width="560" height="315" '
        r'src="https://www.youtube.com/embed/\1" '
        r'frameborder="0" allowfullscreen></iframe>'
    )
    html_content = re.sub(plain_yt_pattern, plain_yt_replacement, html_content)

    return html_content

def home(request):
    # If no users exist, redirect to setup page
    if not User.objects.exists():
        return redirect('setup_admin')
    return render(request, 'tapnote/editor.html', {
        'fonts': font_options(),
        'selected_font': DEFAULT_FONT,
    })

@csrf_exempt
def setup_admin(request):
    # Security check: only allow if no users exist
    if User.objects.exists():
        return redirect('home')
        
    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        email = request.POST.get('email', '')
        
        if username and password:
            user = User.objects.create_superuser(username=username, email=email, password=password)
            login(request, user)
            return redirect('home')
            
    return render(request, 'tapnote/setup.html')

@csrf_exempt
def publish(request):
    if request.method == 'POST':
        content = request.POST.get('content', '').strip()
        title = request.POST.get('title', '').strip()
        author = request.POST.get('author', '').strip()
        link_target = request.POST.get('link_target', '_self')
        font = normalize_font(request.POST.get('font'))
        
        if len(content) > MAX_CONTENT_LENGTH:
            return render(request, 'tapnote/editor.html', {
                'error': f'Content exceeds the limit of {MAX_CONTENT_LENGTH} characters.',
                'note': {'content': content, 'title': title, 'author': author, 'link_target': link_target},
                'fonts': font_options(),
                'selected_font': font,
            })
        if content:
            note = Note.objects.create(
                content=content, title=title, author=author, link_target=link_target, font=font
            )
            response = redirect('view_note', hashcode=note.hashcode)
            # Set cookie with SameSite=Lax for robustness
            response.set_cookie(f'edit_token_{note.hashcode}', note.edit_token, max_age=31536000, samesite='Lax')
            return response
    return redirect('home')

def render_markdown_html(md_text, target="_self"):
    """Render note markdown to HTML exactly as the note page does."""
    # FIRST apply strikethrough by regex
    raw_with_del = apply_strikethrough(md_text)

    # THEN convert with standard Markdown (no strikethrough extension)
    md = markdown.Markdown(extensions=['fenced_code', 'tables', 'footnotes'])
    html_content = md.convert(raw_with_del)
    return process_markdown_links(html_content, target=target)


def view_note(request, hashcode):
    # Validate hashcode format (allow 8-32 chars, alphanumeric)
    if not re.match(r'^[a-zA-Z0-9]{8,32}$', hashcode):
        raise Http404()
    
    note = get_object_or_404(Note, hashcode=hashcode)
    
    html_content = render_markdown_html(note.content, target=note.link_target)
    
    # Use constant-time comparison for edit token
    cookie_token = request.COOKIES.get(f'edit_token_{note.hashcode}')
    url_token = request.GET.get('token')
    
    token_is_valid = False
    if url_token and constant_time_compare(str(url_token), str(note.edit_token)):
        token_is_valid = True
    elif cookie_token and constant_time_compare(str(cookie_token), str(note.edit_token)):
        token_is_valid = True
        
    can_edit = token_is_valid
    
    # Extract title and description for meta tags
    lines = note.content.strip().split('\n')
    full_text = note.content.strip()
    meta_title = "scrbl"
    meta_description = "A simple markdown note."

    # Determine Title
    if note.title:
        meta_title = note.title
    elif lines:
        # First line as title, clean up markdown headers
        candidate_title = re.sub(r'^#+\s*', '', lines[0]).strip()
        if candidate_title:
            meta_title = candidate_title[:60]

    # Determine Description
    if lines:
        if note.title:
            # If we have an explicit title, the description starts from the beginning of content
            meta_description = full_text[:200]
        elif len(lines) > 1:
            # If title was inferred from first line, skip it in description
            meta_description = full_text[len(lines[0]):].strip()[:200]
        else:
            meta_description = full_text[:200]
    
    if note.author:
        meta_description = f"By {note.author}. {meta_description}"

    # Try to find an image for social preview
    meta_image = None
    # Match markdown image ![alt](url) or HTML <img src="url">
    img_match = re.search(r'!\[.*?\]\((.*?)\)|<img.*?src=["\'](.*?)["\']', full_text)
    if img_match:
        # img_match.group(1) is markdown url, group(2) is html src
        meta_image = img_match.group(1) or img_match.group(2)

    # Typography for this note
    note_font = normalize_font(note.font)
    extra_font_family = "" if note_font == DEFAULT_FONT else FONTS[note_font]["google_family"]

    # Auto-refresh/set cookie if valid URL token is provided
    # This ensures robustness: if user visits with token link, browser remembers permission
    if url_token and token_is_valid:
        response = render(request, 'tapnote/view_note.html', {
            'note': note,
            'content': html_content,
            'can_edit': can_edit,
            'meta_title': meta_title,
            'meta_description': meta_description,
            'meta_image': meta_image,
            'enable_comments': settings.ENABLE_COMMENTS,
            'note_font': note_font,
            'extra_font_family': extra_font_family,
        })
        response.set_cookie(f'edit_token_{note.hashcode}', note.edit_token, max_age=31536000, samesite='Lax')
    else:
        response = render(request, 'tapnote/view_note.html', {
            'note': note,
            'content': html_content,
            'can_edit': can_edit,
            'meta_title': meta_title,
            'meta_description': meta_description,
            'meta_image': meta_image,
            'enable_comments': settings.ENABLE_COMMENTS,
            'note_font': note_font,
            'extra_font_family': extra_font_family,
        })
        
    # Increment views
    try:
        Note.objects.filter(pk=note.pk).update(views=models.F('views') + 1)
    except:
        pass
        
    return response

@csrf_exempt
def edit_note(request, hashcode):
    # Validate hashcode format (allow 8-32 chars, alphanumeric)
    if not re.match(r'^[a-zA-Z0-9]{8,32}$', hashcode):
        raise Http404()
    
    note = get_object_or_404(Note, hashcode=hashcode)
    edit_token = request.COOKIES.get(f'edit_token_{note.hashcode}')
    url_token = request.GET.get('token')
    
    # Use constant-time comparison
    if not ((edit_token and constant_time_compare(str(edit_token), str(note.edit_token))) or
            (url_token and constant_time_compare(str(url_token), str(note.edit_token)))):
        raise Http404()
    
    if request.method == 'POST':
        content = request.POST.get('content', '').strip()
        title = request.POST.get('title', '').strip()
        author = request.POST.get('author', '').strip()
        link_target = request.POST.get('link_target', '_self')
        font = normalize_font(request.POST.get('font'))
        
        if len(content) > MAX_CONTENT_LENGTH:
            return render(request, 'tapnote/editor.html', {
                'note': note,
                'error': f'Content exceeds the limit of {MAX_CONTENT_LENGTH} characters.',
                'fonts': font_options(),
                'selected_font': font,
            })
            
        if content:
            note.content = content
            note.title = title
            note.author = author
            note.link_target = link_target
            note.font = font
            note.save()
            response = redirect('view_note', hashcode=note.hashcode)
            # Refresh cookie on edit
            response.set_cookie(f'edit_token_{note.hashcode}', note.edit_token, max_age=31536000, samesite='Lax')
            return response
    
    return render(request, 'tapnote/editor.html', {
        'note': note,
        'fonts': font_options(),
        'selected_font': normalize_font(note.font),
    })

@csrf_exempt
def preview_note(request):
    """Render editor content to HTML for the live preview pane (no writes)."""
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST required'}, status=405)

    content = request.POST.get('content', '')
    title = request.POST.get('title', '')
    author = request.POST.get('author', '')

    if len(content) > MAX_CONTENT_LENGTH:
        return JsonResponse({'ok': False, 'error': 'content_too_long'}, status=400)

    if not content.strip():
        return JsonResponse({'ok': True, 'html': ''})

    html_content = render_markdown_html(content, target='_self')
    html = render_to_string('tapnote/_note_preview.html', {
        'content': html_content,
        'title': title,
        'author': author,
    }, request=request)

    return JsonResponse({'ok': True, 'html': html})

def handler404(request, exception):
    return render(request, 'tapnote/404.html', status=404)

@staff_member_required
def migration(request):
    return render(request, 'tapnote/migration.html')

@staff_member_required
def export_data(request):
    notes = Note.objects.all()
    data = []
    for note in notes:
        data.append({
            'hashcode': note.hashcode,
            'content': note.content,
            'title': note.title,
            'author': note.author,
            'link_target': note.link_target,
            'font': note.font,
            'edit_token': note.edit_token,
            'created_at': note.created_at.isoformat(),
            'updated_at': note.updated_at.isoformat(),
        })
    
    response = HttpResponse(
        json.dumps(data, indent=2),
        content_type='application/json'
    )
    response['Content-Disposition'] = 'attachment; filename="scrbl_backup.json"'
    return response

@csrf_exempt
@staff_member_required
def import_data(request):
    if request.method == 'POST' and request.FILES.get('file'):
        try:
            json_file = request.FILES['file']
            data = json.load(json_file)
            
            count = 0
            for item in data:
                defaults = {
                    'content': item['content'],
                    'edit_token': item['edit_token'],
                }
                if 'link_target' in item:
                    defaults['link_target'] = item['link_target']
                if 'font' in item:
                    defaults['font'] = normalize_font(item['font'])
                if 'created_at' in item:
                    defaults['created_at'] = parse_datetime(item['created_at'])
                
                note, created = Note.objects.update_or_create(
                    hashcode=item['hashcode'],
                    defaults=defaults
                )
                
                # Force update updated_at if present
                if 'updated_at' in item:
                    updated_at = parse_datetime(item['updated_at'])
                    Note.objects.filter(pk=note.pk).update(updated_at=updated_at)
                
                count += 1
                
            return render(request, 'tapnote/migration.html', {'success': f'Successfully imported {count} notes.'})
        except Exception as e:
            return render(request, 'tapnote/migration.html', {'error': f'Error importing file: {str(e)}'})
            
    return redirect('migration')

@csrf_exempt
def api_create_account(request):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST required'}, status=405)
    
    try:
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST
            
        short_name = data.get('short_name')
        author_name = data.get('author_name', '')
        author_url = data.get('author_url', '')
        
        if not short_name:
            return JsonResponse({'ok': False, 'error': 'SHORT_NAME_REQUIRED'}, status=400)
            
        account = TelegraphAccount.objects.create(
            short_name=short_name,
            author_name=author_name or 'Anonymous',
            author_url=author_url
        )
        
        return JsonResponse({
            'ok': True,
            'result': {
                'short_name': account.short_name,
                'author_name': account.author_name,
                'author_url': account.author_url,
                'access_token': account.access_token,
                'auth_url': '' # Not implemented
            }
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)

@csrf_exempt
def api_revoke_access_token(request):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST required'}, status=405)
    
    try:
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST
            
        access_token = data.get('access_token')
        if not access_token:
             return JsonResponse({'ok': False, 'error': 'ACCESS_TOKEN_REQUIRED'}, status=400)
        
        try:
            account = TelegraphAccount.objects.get(access_token=access_token)
        except TelegraphAccount.DoesNotExist:
            return JsonResponse({'ok': False, 'error': 'INVALID_ACCESS_TOKEN'}, status=401)
            
        account.access_token = secrets.token_hex(32)
        account.save()
        
        return JsonResponse({
            'ok': True,
            'result': {
                'access_token': account.access_token,
                'auth_url': ''
            }
        })
    except Exception as e:
         return JsonResponse({'ok': False, 'error': str(e)}, status=500)

@csrf_exempt
def api_edit_page(request, path=None):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST required'}, status=405)
    
    try:
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST
        
        path = data.get('path', path)
        access_token = data.get('access_token')
        title = data.get('title')
        content_raw = data.get('content')
        author_name = data.get('author_name')
        author_url = data.get('author_url') # Currently unused in Note model but accepted
        return_content = data.get('return_content', False)
        
        if isinstance(return_content, str):
            return_content = return_content.lower() == 'true'
            
        if not path:
             return JsonResponse({'ok': False, 'error': 'PATH_REQUIRED'}, status=400)
        if not access_token:
             return JsonResponse({'ok': False, 'error': 'ACCESS_TOKEN_REQUIRED'}, status=400)
        if not title:
             return JsonResponse({'ok': False, 'error': 'TITLE_REQUIRED'}, status=400)
        if not content_raw:
             return JsonResponse({'ok': False, 'error': 'CONTENT_REQUIRED'}, status=400)
             
        # Validate Account
        try:
            account = TelegraphAccount.objects.get(access_token=access_token)
        except TelegraphAccount.DoesNotExist:
             return JsonResponse({'ok': False, 'error': 'INVALID_ACCESS_TOKEN'}, status=401)
             
        # Get Note
        try:
            note = Note.objects.get(hashcode=path)
        except Note.DoesNotExist:
             return JsonResponse({'ok': False, 'error': 'PAGE_NOT_FOUND'}, status=404)
        
        # Check permission: Must belong to this account
        if note.account != account:
             return JsonResponse({'ok': False, 'error': 'PERMISSION_DENIED'}, status=403)
             
        # Parse content
        nodes = []
        if isinstance(content_raw, str):
            try:
                nodes = json.loads(content_raw)
            except json.JSONDecodeError:
                 return JsonResponse({'ok': False, 'error': 'Content must be a valid JSON string of nodes'}, status=400)
        elif isinstance(content_raw, list):
            nodes = content_raw
        else:
            return JsonResponse({'ok': False, 'error': 'Invalid content format'}, status=400)

        markdown_content = nodes_to_markdown(nodes)
        
        # Update
        note.title = title
        note.content = markdown_content
        if author_name:
            note.author = author_name
        note.save()
        
        result = {
            'path': note.hashcode,
            'url': request.build_absolute_uri(f'/{note.hashcode}/'),
            'title': note.title,
            'description': '',
            'views': note.views,
        }
        if note.author:
             result['author_name'] = note.author
             
        if return_content:
            result['content'] = nodes
            
        return JsonResponse({'ok': True, 'result': result})
        
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)

@csrf_exempt
def api_get_account_info(request):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST required'}, status=405)
        
    try:
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST
            
        access_token = data.get('access_token')
        fields = data.get('fields', ['short_name', 'author_name', 'author_url'])
        
        # fields can be a list or json string
        if isinstance(fields, str):
             try:
                 fields = json.loads(fields)
             except:
                 pass # keep as is if not json
                 
        if not access_token:
            return JsonResponse({'ok': False, 'error': 'ACCESS_TOKEN_REQUIRED'}, status=400)
            
        try:
            account = TelegraphAccount.objects.get(access_token=access_token)
        except TelegraphAccount.DoesNotExist:
            return JsonResponse({'ok': False, 'error': 'INVALID_ACCESS_TOKEN'}, status=401)
            
        result = {}
        if 'short_name' in fields:
            result['short_name'] = account.short_name
        if 'author_name' in fields:
            result['author_name'] = account.author_name
        if 'author_url' in fields:
            result['author_url'] = account.author_url
        if 'page_count' in fields:
            result['page_count'] = account.pages.count()
            
        return JsonResponse({'ok': True, 'result': result})
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)

@csrf_exempt
def api_get_page_list(request):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST required'}, status=405)
    
    try:
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST
            
        access_token = data.get('access_token')
        offset = int(data.get('offset', 0))
        limit = int(data.get('limit', 50))
        
        if limit > 200: limit = 200
        
        if not access_token:
            return JsonResponse({'ok': False, 'error': 'ACCESS_TOKEN_REQUIRED'}, status=400)
            
        try:
            account = TelegraphAccount.objects.get(access_token=access_token)
        except TelegraphAccount.DoesNotExist:
            return JsonResponse({'ok': False, 'error': 'INVALID_ACCESS_TOKEN'}, status=401)
            
        notes = account.pages.all().order_by('-created_at')[offset:offset+limit]
        total_count = account.pages.count()
        
        pages = []
        for note in notes:
            page = {
                'path': note.hashcode,
                'url': request.build_absolute_uri(f'/{note.hashcode}/'),
                'title': note.title,
                'description': note.content[:100],
                'views': note.views,
                'can_edit': True
            }
            if note.author:
                page['author_name'] = note.author
            pages.append(page)
            
        return JsonResponse({
            'ok': True,
            'result': {
                'total_count': total_count,
                'pages': pages
            }
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)

@csrf_exempt
def api_get_views(request, path=None):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST required'}, status=405)
    
    try:
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST
            
        path = data.get('path', path)
        if not path:
             return JsonResponse({'ok': False, 'error': 'PATH_REQUIRED'}, status=400)
             
        try:
            note = Note.objects.get(hashcode=path)
        except Note.DoesNotExist:
             return JsonResponse({'ok': False, 'error': 'PAGE_NOT_FOUND'}, status=404)
             
        return JsonResponse({
            'ok': True,
            'result': {
                'views': note.views
            }
        })
    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)

@csrf_exempt
def api_create_page(request):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'POST required'}, status=405)
    
    try:
        # Support both JSON body and Form data
        if request.content_type == 'application/json':
            data = json.loads(request.body)
        else:
            data = request.POST

        title = data.get('title')
        author_name = data.get('author_name', '')
        content_raw = data.get('content')
        access_token = data.get('access_token')
        return_content = data.get('return_content', False)
        
        if isinstance(return_content, str):
            return_content = return_content.lower() == 'true'

        if not title:
             return JsonResponse({'ok': False, 'error': 'Title is required'}, status=400)
        
        if not content_raw:
             return JsonResponse({'ok': False, 'error': 'Content is required'}, status=400)

        # Content parsing
        nodes = []
        if isinstance(content_raw, str):
            try:
                nodes = json.loads(content_raw)
            except json.JSONDecodeError:
                 return JsonResponse({'ok': False, 'error': 'Content must be a valid JSON string of nodes'}, status=400)
        elif isinstance(content_raw, list):
            nodes = content_raw
        else:
            return JsonResponse({'ok': False, 'error': 'Invalid content format'}, status=400)

        markdown_content = nodes_to_markdown(nodes)
        
        # Check Access Token
        account = None
        if access_token:
            try:
                account = TelegraphAccount.objects.get(access_token=access_token)
                # If author_name not provided, use account default
                if not author_name:
                    author_name = account.author_name
            except TelegraphAccount.DoesNotExist:
                 return JsonResponse({'ok': False, 'error': 'INVALID_ACCESS_TOKEN'}, status=401)
        
        # Create Note
        note = Note.objects.create(
            title=title,
            author=author_name,
            content=markdown_content,
            account=account
        )
        
        # Prepare response
        result = {
            'path': note.hashcode,
            'url': request.build_absolute_uri(f'/{note.hashcode}/'),
            'title': note.title,
            'description': '',
            'views': 0,
            'can_edit': True 
        }
        
        if author_name:
            result['author_name'] = author_name
            
        if return_content:
            result['content'] = nodes
            
        return JsonResponse({'ok': True, 'result': result})

    except Exception as e:
        return JsonResponse({'ok': False, 'error': str(e)}, status=500)

@csrf_exempt
def api_get_page(request, path=None):
    if request.method == 'POST':
        if request.content_type == 'application/json':
            try:
                data = json.loads(request.body)
            except:
                data = {}
        else:
            data = request.POST
        
        path = data.get('path', path)
        return_content = data.get('return_content', False)
    else:
        # Allow GET for convenience
        path = request.GET.get('path', path)
        return_content = request.GET.get('return_content', False)

    if isinstance(return_content, str):
        return_content = return_content.lower() == 'true'

    if not path:
        return JsonResponse({'ok': False, 'error': 'Path is required'}, status=400)

    try:
        note = Note.objects.get(hashcode=path)
    except Note.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'Page not found'}, status=404)

    result = {
        'path': note.hashcode,
        'url': request.build_absolute_uri(f'/{note.hashcode}/'),
        'title': note.title or '',
        'description': note.content[:100],
        'views': 0,
    }
    
    if note.author:
        result['author_name'] = note.author

    if return_content:
        result['content'] = markdown_to_nodes(note.content)

    return JsonResponse({'ok': True, 'result': result})
