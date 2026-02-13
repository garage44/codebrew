import {deepSignal} from 'deepsignal'

import {
    Button,
    ButtonGroup,
    FieldCheckbox,
    FieldCheckboxGroup,
    FieldMultiSelect,
    FieldNumber,
    FieldRadioGroup,
    FieldSelect,
    FieldSlider,
    FieldText,
    FieldTextarea,
    FieldUpload,
    Icon,
} from '@/components'

// Form data model
const formData = deepSignal({
    age: 0,
    // Additional Info
    bio: '',
    confirmPassword: '',
    country: '',

    email: '',
    experienceLevel: {locked: false, value: 0} as {locked: boolean; value: number},
    // Personal Information
    firstName: '',

    interests: [],
    lastName: '',
    notifications: {
        email: false,
        push: false,
        sms: false,
    },

    // Account Settings
    password: '',
    profilePicture: '',
    termsAccepted: false,
    // Preferences
    themePreference: 'auto',
})

// Form submission handler
const handleSubmit = async (e: Event) => {
    e.preventDefault()

    // Basic validation
    if (!formData.firstName || !formData.lastName || !formData.email) {
        alert('Please fill in all required fields')
        return
    }

    if (formData.password !== formData.confirmPassword) {
        alert('Passwords do not match')
        return
    }

    if (!formData.termsAccepted) {
        alert('You must accept the terms and conditions')
        return
    }

    // Simulate form submission
    alert('Form submitted successfully!')
}

// Form reset handler
const handleReset = () => {
    // Reset form data
    formData.firstName = ''
    formData.lastName = ''
    formData.email = ''
    formData.age = 0
    formData.password = ''
    formData.confirmPassword = ''
    formData.termsAccepted = false
    formData.themePreference = 'auto'
    formData.notifications = {email: false, push: false, sms: false}
    formData.interests = []
    formData.bio = ''
    formData.country = ''
    formData.experienceLevel = {locked: false, value: 0}
    formData.profilePicture = ''

    alert('Form has been reset')
}

export const Forms = () => {
    return (
        <div class='styleguide-page'>
            <h1>Forms</h1>
            <p>
                Comprehensive form showcase demonstrating all field components with best practices for form layout and user
                experience.
            </p>

            <div class='form-demo'>
                <form class='form' onSubmit={handleSubmit}>
                    {/* Personal Information Section */}
                    <fieldset class='form-section'>
                        <legend class='header'>Personal Information</legend>
                        <div class='content'>
                            <div class='form-row'>
                                <FieldText
                                    help='Please enter your first name'
                                    label='First Name'
                                    model={formData.$firstName}
                                    placeholder='Enter your first name'
                                />
                                <FieldText
                                    help='Please enter your last name'
                                    label='Last Name'
                                    model={formData.$lastName}
                                    placeholder='Enter your last name'
                                />
                            </div>
                            <div class='form-row'>
                                <FieldText
                                    help='Please enter your email address'
                                    label='Email Address'
                                    model={formData.$email}
                                    placeholder='Enter your email'
                                    type='email'
                                />
                                <FieldNumber
                                    help='Please enter your age'
                                    label='Age'
                                    onChange={(v) => (formData.age = v)}
                                    value={formData.age}
                                />
                            </div>
                        </div>
                    </fieldset>

                    {/* Account Settings Section */}
                    <fieldset class='form-section'>
                        <legend class='header'>Account Settings</legend>
                        <div class='content'>
                            <div class='form-row'>
                                <FieldText
                                    help='Please enter your password'
                                    label='Password'
                                    model={formData.$password}
                                    placeholder='Enter your password'
                                    type='password'
                                />
                                <FieldText
                                    help='Please confirm your password'
                                    label='Confirm Password'
                                    model={formData.$confirmPassword}
                                    placeholder='Confirm your password'
                                    type='password'
                                />
                            </div>
                            <div class='form-row'>
                                <FieldCheckbox label='I accept the terms and conditions' model={formData.$termsAccepted} />
                            </div>
                        </div>
                    </fieldset>

                    {/* Preferences Section */}
                    <fieldset class='form-section'>
                        <legend class='header'>Preferences</legend>
                        <div class='content'>
                            <div class='form-row'>
                                <FieldRadioGroup
                                    label='Theme Preference'
                                    onChange={(v) => (formData.themePreference = v)}
                                    options={[
                                        ['light', 'Light'],
                                        ['dark', 'Dark'],
                                        ['auto', 'Auto (System)'],
                                    ]}
                                    value={formData.themePreference}
                                />
                                <FieldCheckboxGroup
                                    className=''
                                    label='Notifications'
                                    model={[
                                        {label: 'Email notifications', value: formData.notifications.email},
                                        {label: 'Push notifications', value: formData.notifications.push},
                                        {label: 'SMS notifications', value: formData.notifications.sms},
                                    ]}
                                >
                                    <div />
                                </FieldCheckboxGroup>
                            </div>
                            <div class='form-row'>
                                <FieldMultiSelect
                                    label='Interests'
                                    onChange={(v) => (formData.interests = v)}
                                    options={[
                                        {id: 'tech', name: 'Technology'},
                                        {id: 'design', name: 'Design'},
                                        {id: 'business', name: 'Business'},
                                        {id: 'art', name: 'Art'},
                                        {id: 'sports', name: 'Sports'},
                                        {id: 'music', name: 'Music'},
                                    ]}
                                    value={formData.interests}
                                />
                            </div>
                        </div>
                    </fieldset>

                    {/* Additional Info Section */}
                    <fieldset class='form-section'>
                        <legend class='header'>Additional Information</legend>
                        <div class='content'>
                            <div class='form-row'>
                                <FieldTextarea
                                    label='Bio'
                                    onChange={(v) => (formData.bio = v)}
                                    placeholder='Tell us about yourself...'
                                    value={formData.bio}
                                />
                                <FieldSelect
                                    label='Country'
                                    model={formData.$country}
                                    options={[
                                        {id: '', name: 'Select a country'},
                                        {id: 'us', name: 'United States'},
                                        {id: 'ca', name: 'Canada'},
                                        {id: 'uk', name: 'United Kingdom'},
                                        {id: 'de', name: 'Germany'},
                                        {id: 'fr', name: 'France'},
                                        {id: 'jp', name: 'Japan'},
                                    ]}
                                />
                            </div>
                            <div class='form-row'>
                                <div class='form-slider-container field'>
                                    <div class='label'>Experience Level</div>
                                    <FieldSlider
                                        IconComponent={Icon}
                                        onChange={(v) => {
                                            formData.experienceLevel = {...v, locked: v.locked ?? false}
                                        }}
                                        value={{...formData.experienceLevel, locked: formData.experienceLevel.locked ?? false}}
                                    />
                                </div>
                                <FieldUpload label='Profile Picture' model={[formData, 'profilePicture']} />
                            </div>
                        </div>
                    </fieldset>

                    {/* Form Actions */}
                    <div class='form-actions'>
                        <ButtonGroup active={false}>
                            <Button icon='save' label='Submit Form' onClick={handleSubmit} type='success' />
                            <Button icon='refresh' label='Reset Form' onClick={handleReset} type='default' />
                        </ButtonGroup>
                    </div>
                </form>
            </div>
        </div>
    )
}
