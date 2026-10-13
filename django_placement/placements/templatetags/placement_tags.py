from django import template

register = template.Library()

@register.filter(name='dict_get')
def dict_get(dictionary, key):
    if isinstance(dictionary, dict):
        return dictionary.get(key)
    return None
