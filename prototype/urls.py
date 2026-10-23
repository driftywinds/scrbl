"""
URL configuration for prototype project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path
from tapnote import views
from django.conf.urls.static import static
from django.conf import settings

handler404 = 'tapnote.views.handler404'

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.home, name='home'),
    path('setup/', views.setup_admin, name='setup_admin'),
    path('publish/', views.publish, name='publish'),
    path('migration/', views.migration, name='migration'),
    path('migration/export/', views.export_data, name='export_data'),
    path('migration/import/', views.import_data, name='import_data'),
    path('api/v1/comments', views.api_comments, name='api_comments'),
    path('api/v1/comments/like', views.api_like_comment, name='api_like_comment'),
    path('api/v1/ban', views.api_ban, name='api_ban'),
    path('createAccount', views.api_create_account, name='api_create_account'),
    path('editPage', views.api_edit_page, name='api_edit_page'),
    path('editPage/<str:path>', views.api_edit_page, name='api_edit_page_with_path'),
    path('getAccountInfo', views.api_get_account_info, name='api_get_account_info'),
    path('revokeAccessToken', views.api_revoke_access_token, name='api_revoke_access_token'),
    path('getPageList', views.api_get_page_list, name='api_get_page_list'),
    path('getViews', views.api_get_views, name='api_get_views'),
    path('getViews/<str:path>', views.api_get_views, name='api_get_views_with_path'),
    path('createPage', views.api_create_page, name='api_create_page'),
    path('getPage', views.api_get_page, name='api_get_page'),
    path('getPage/<str:path>', views.api_get_page, name='api_get_page_with_path'),
    path('<str:hashcode>/', views.view_note, name='view_note'),
    path('<str:hashcode>/edit/', views.edit_note, name='edit_note'),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
