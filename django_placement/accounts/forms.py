from django import forms
from django.contrib.auth.models import User
from .models import UserProfile, UserRole


class LoginForm(forms.Form):
    username = forms.CharField(
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': 'Institutional Username or Email',
            'autocomplete': 'username'
        })
    )
    password = forms.CharField(
        widget=forms.PasswordInput(attrs={
            'class': 'form-control',
            'placeholder': '••••••••••••',
            'autocomplete': 'current-password'
        })
    )


class UserCreationByAdminForm(forms.ModelForm):
    username = forms.CharField(max_length=150, widget=forms.TextInput(attrs={'class': 'form-control'}))
    email = forms.EmailField(widget=forms.EmailInput(attrs={'class': 'form-control'}))
    password = forms.CharField(widget=forms.PasswordInput(attrs={'class': 'form-control'}))
    full_name = forms.CharField(max_length=150, widget=forms.TextInput(attrs={'class': 'form-control'}))
    role = forms.ChoiceField(choices=UserRole.choices, widget=forms.Select(attrs={'class': 'form-select'}))
    phone_number = forms.CharField(required=False, widget=forms.TextInput(attrs={'class': 'form-control'}))

    class Meta:
        model = User
        fields = ['username', 'email']

    def clean_username(self):
        username = self.cleaned_data.get('username')
        if User.objects.filter(username=username).exists():
            raise forms.ValidationError("Username already exists in institutional records.")
        return username


class UserProfileEditForm(forms.ModelForm):
    class Meta:
        model = UserProfile
        fields = ['full_name', 'phone_number']
        widgets = {
            'full_name': forms.TextInput(attrs={'class': 'form-control'}),
            'phone_number': forms.TextInput(attrs={'class': 'form-control'}),
        }
