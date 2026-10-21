# -*- coding: utf-8 -*-
"""Tests de ailabsaudit_tracker.page_profile."""
from ailabsaudit_tracker.page_profile import extract_page_profile


def test_table_dominant():
    html = """
    <html><head><title>Mon tableau</title></head><body>
    <h1>Titre</h1>
    <table><tr><td>a</td></tr></table>
    <table><tr><td>b</td></tr></table>
    <p>texte</p>
    </body></html>
    """
    p = extract_page_profile(html)
    assert p['has_table'] is True
    assert p['format'] == 'table'
    assert p['title'] == 'Mon tableau'
    assert p['word_count'] >= 1


def test_list_dominant():
    items = ''.join(f'<li>item {i}</li>' for i in range(8))
    html = f'<html><body><ul>{items}</ul></body></html>'
    p = extract_page_profile(html)
    assert p['has_list'] is True
    assert p['list_item_count'] == 8
    assert p['format'] == 'list'


def test_text_dominant():
    html = '<html><body><p>Un simple paragraphe de texte sans structure.</p></body></html>'
    p = extract_page_profile(html)
    assert p['format'] == 'text'
    assert p['has_table'] is False


def test_mixed():
    html = '<html><body><table><tr><td>x</td></tr></table><ul><li>a</li></ul></body></html>'
    p = extract_page_profile(html)
    assert p['format'] == 'mixed'


def test_ignore_scripts():
    html = '<html><body><script>var t=1; table table table</script><p>ok</p></body></html>'
    p = extract_page_profile(html)
    assert p['has_table'] is False
    assert p['word_count'] >= 1


def test_vide_ou_invalide():
    assert extract_page_profile(None) is None
    assert extract_page_profile('') is None
    assert extract_page_profile('pas de html') is None
