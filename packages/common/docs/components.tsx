import {
    Button,
    ButtonGroup,
    Chart,
    ContextInput,
    ContextSelect,
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
    Hint,
    Icon,
    IconChat,
    IconLogo,
    Notifications,
    Progress,
    Splash,
} from '@/components'
// Import utilities from common components
import {ComponentDemo} from '@/components/lib/component-demo'
import {Notifier} from '@/lib/notifier'
import {StateView} from '@/components/lib/state-view'
import {deepSignal} from 'deepsignal'
import {svg} from '@/components/ui/icon/icon'


const data = deepSignal({
    model: {
        checkboxGroupValue: ['item1'],
        checkboxValue: true,
        contextInput: '',
        contextSelectValue: 'option1',
        multiSelectValue: [],
        notifications: [],
        numberValue: 0,
        radioValue: 'option1',
        selectValue: '',
        sliderValue: {locked: false, value: 50} as {locked: boolean; value: number},
        textareaValue: '',
        textInput: '',
        uploadValue: '',
    },
})

const notifier = new Notifier()
notifier.init(data.model.notifications)

export const Components = () => <div class='c-components styleguide-page'>
        <h1>Components</h1>
        <p>All available components from @garage44/common</p>

        <ComponentDemo component='Button' title='Button'>
            <div class='demo-grid'>
                <div class='item-container'>
                    <div class='item-label'>Default</div>
                    <div class='item-variant'>
                        <Button icon='workspace' label='Default' type='default' />
                        <Button active={true} icon='workspace' label='Default Active' type='default' />
                        <Button disabled={true} icon='workspace' label='Default Disabled' type='default' />
                    </div>

                    <div class='item-variant'>
                        <Button icon='workspace' label='Info' type='info' />
                        <Button active={true} icon='workspace' label='Info Active' type='info' />
                        <Button disabled={true} icon='workspace' label='Info Disabled' type='info' />
                    </div>

                    <div class='item-variant'>
                        <Button icon='workspace' label='Success' type='success' />
                        <Button active={true} icon='workspace' label='Success Active' type='success' />
                        <Button disabled={true} icon='workspace' label='Success Disabled' type='success' />
                    </div>

                    <div class='item-variant'>
                        <Button icon='workspace' label='Danger' type='danger' />
                        <Button active={true} icon='workspace' label='Danger Active' type='danger' />
                        <Button disabled={true} icon='workspace' label='Danger Disabled' type='danger' />
                    </div>

                    <div class='item-variant'>
                        <Button icon='workspace' label='Warning' type='warning' />
                        <Button active={true} icon='workspace' label='Warning Active' type='warning' />
                        <Button disabled={true} icon='workspace' label='Warning Disabled' type='warning' />
                    </div>
                </div>
                <div class='item-container'>
                    <div class='item-label'>Toggle</div>
                    <div class='item-variant'>
                        <Button icon='workspace' type='default' variant='toggle' />
                        <Button active={true} icon='workspace' type='default' variant='toggle' />
                        <Button disabled={true} icon='workspace' type='default' variant='toggle' />
                    </div>
                    <div class='item-variant'>
                        <Button icon='workspace' type='info' variant='toggle' />
                        <Button active={true} icon='workspace' type='info' variant='toggle' />
                        <Button disabled={true} icon='workspace' type='info' variant='toggle' />
                    </div>
                    <div class='item-variant'>
                        <Button icon='workspace' type='success' variant='toggle' />
                        <Button active={true} icon='workspace' type='success' variant='toggle' />
                        <Button disabled={true} icon='workspace' type='success' variant='toggle' />
                    </div>
                    <div class='item-variant'>
                        <Button icon='workspace' type='danger' variant='toggle' />
                        <Button active={true} icon='workspace' type='danger' variant='toggle' />
                        <Button disabled={true} icon='workspace' type='danger' variant='toggle' />
                    </div>
                    <div class='item-variant'>
                        <Button icon='workspace' type='warning' variant='toggle' />
                        <Button active={true} icon='workspace' type='warning' variant='toggle' />
                        <Button disabled={true} icon='workspace' type='warning' variant='toggle' />
                    </div>
                </div>


            </div>
        </ComponentDemo>

        <ComponentDemo component='FieldText' title='Field Text'>
            <div class='demo-grid'>
                <FieldText help='Enter help text...' label='Basic Input' model={data.model.$textInput} />
                <FieldText
                    help='Enter help text...'
                    label='With Placeholder'
                    model={data.model.$textInput}
                    placeholder='Enter text...'
                />
                <FieldText help='Enter help text...' label='Required Field' model={data.model.$textInput} />
                <FieldText disabled help='Enter help text...' label='Disabled' model={data.model.$textInput} />
            </div>
            <StateView state={{textInput: data.model.textInput}} title='Field Text State' />
        </ComponentDemo>

        <ComponentDemo component='FieldCheckbox' title='Field Checkbox'>
            <div class='demo-grid'>
                <FieldCheckbox
                    help='Enter help text...'
                    label='Basic Checkbox'
                    model={data.model.$checkboxValue}
                />
                <FieldCheckbox
                    help='Enter help text...'
                    label='Checked'
                    model={data.model.$checkboxValue}
                />
                <FieldCheckbox
                    help='Enter help text...'
                    label='Disabled'
                    model={data.model.$checkboxValue}
                />
            </div>
            <StateView state={{checkboxValue: data.model.checkboxValue}} title='Field Checkbox State' />
        </ComponentDemo>

        <ComponentDemo component='Icon' title='Icon'>
            <div class='icon-grid'>
                {Object.keys(svg).map((iconName) => <div class='item' key={iconName}>
                        <Icon name={iconName} tip={iconName} />
                </div>)}
            </div>
        </ComponentDemo>

        <ComponentDemo component='Progress' title='Progress'>
            <div class='demo-grid'>
                <Progress boundaries={[0, 100]} iso6391='en' loading={false} percentage={0} />
                <Progress boundaries={[0, 100]} iso6391='en' loading={false} percentage={0.25} />
                <Progress boundaries={[0, 100]} iso6391='en' loading={false} percentage={0.5} />
                <Progress boundaries={[0, 100]} iso6391='en' loading={false} percentage={0.75} />
                <Progress boundaries={[0, 100]} iso6391='en' loading={false} percentage={1} />
            </div>
        </ComponentDemo>


        <ComponentDemo component='FieldSelect' title='Field Select'>
            <div class='demo-grid'>
                <FieldSelect
                    help='I am a select description'
                    label='Basic Select'
                    model={data.model.$selectValue!}
                    options={[
                        {id: 'option1', name: 'Option 1'},
                        {id: 'option2', name: 'Option 2'},
                        {id: 'option3', name: 'Option 3'},
                    ]}
                />
            </div>
            <StateView state={{selectValue: data.model.selectValue}} title='Field Select State' />
        </ComponentDemo>

        <ComponentDemo component='FieldCheckboxGroup' title='Field Checkbox Group'>
            <div class='demo-grid'>
                <FieldCheckboxGroup
                    className=''
                    model={[
                        {label: 'Item 1', value: data.model.checkboxGroupValue.includes('item1')},
                        {label: 'Item 2', value: data.model.checkboxGroupValue.includes('item2')},
                        {label: 'Item 3', value: data.model.checkboxGroupValue.includes('item3')},
                    ]}
                >
                    <div />
                </FieldCheckboxGroup>
            </div>
            <StateView state={{checkboxGroupValue: data.model.checkboxGroupValue}} title='Field Checkbox Group State' />
        </ComponentDemo>

        <ComponentDemo component='FieldUpload' title='Field Upload'>
            <div class='demo-grid'>
                <FieldUpload
                    label='File Upload'
                    model={[data.model, 'uploadValue']}
                />
            </div>
            <StateView state={{uploadValue: data.model.uploadValue}} title='Field Upload State' />
        </ComponentDemo>

        <ComponentDemo component='Notifications' title='Notifications'>
            <Button
                label='Add notification'
                onClick={() => {
                    console.log('CLICK')
                    notifier.notify({
                        icon: 'info',
                        id: Date.now(),
                        link: {text: '', url: ''},
                        list: [],
                        message: 'Hello there',
                        type: 'info',
                    })
                }}
            />
            <Notifications notifications={data.model.notifications} />
            <StateView state={{notifications: data.model.notifications}} title='Notifications State' />
        </ComponentDemo>

        <ComponentDemo component='ButtonGroup' title='Button Group'>
            <div class='demo-grid'>
                <ButtonGroup active={false}>
                    <Button icon='settings' label='Settings' />
                    <Button icon='info' label='Info' />
                </ButtonGroup>
                <ButtonGroup active={true}>
                    <Button icon='settings' label='Settings' />
                    <Button icon='info' label='Info' />
                </ButtonGroup>
            </div>
        </ComponentDemo>

        <ComponentDemo component='Chart' title='Chart'>
            <div class='demo-grid'>
                <Chart data={[10, 20, 15, 30, 25, 40, 35, 50]} name='Sample Data' />
                <Chart data={[5, 15, 8, 22, 18, 30, 28, 40, 35, 45, 42, 50]} name='More Data' />
            </div>
        </ComponentDemo>

        <ComponentDemo component='Hint' title='Hint'>
            <div class='demo-grid'>
                <Hint text='This is a helpful hint' />
                <Hint text='Another hint with more information' />
            </div>
        </ComponentDemo>

        <ComponentDemo component='Splash' title='Splash'>
            <div style={{background: 'var(--bg-secondary)', height: '300px'}}>
                <Splash
                    header='Welcome'
                    IconComponent={IconLogo}
                    instruction='This is a splash screen'
                />
            </div>
        </ComponentDemo>

        <ComponentDemo component='IconChat' title='Icon Chat'>
            <div class='c-icon-grid'>
                <div class='item'>
                    <svg style={{height: '48px', width: '48px'}} viewBox='0 0 24 24'>
                        <IconChat />
                    </svg>
                    <span class='label'>No unread</span>
                </div>
                <div class='item'>
                    <svg style={{height: '48px', width: '48px'}} viewBox='0 0 24 24'>
                        <IconChat iconProps={{unread: 3}} />
                    </svg>
                    <span class='label'>3 unread</span>
                </div>
                <div class='item'>
                    <svg style={{height: '48px', width: '48px'}} viewBox='0 0 24 24'>
                        <IconChat iconProps={{unread: 10}} />
                    </svg>
                    <span class='label'>10 unread</span>
                </div>
            </div>
        </ComponentDemo>

        <ComponentDemo component='IconLogo' title='Icon Logo'>
            <div class='c-icon-grid'>
                <div class='item'>
                    <svg style={{height: '96px', width: '96px'}} viewBox='0 0 24 24'>
                        <IconLogo />
                    </svg>
                    <span class='label'>Logo</span>
                </div>
            </div>
        </ComponentDemo>

        <ComponentDemo component='FieldNumber' title='Field Number'>
            <div class='demo-grid'>
                <FieldNumber
                    label='Enter a number'
                    onChange={(v) => data.model.numberValue = v}
                    value={data.model.numberValue}
                />
                <FieldNumber
                    help='Enter a numeric value'
                    label='With help text'
                    onChange={(v) => data.model.numberValue = v}
                    value={data.model.numberValue}
                />
            </div>
            <StateView state={{numberValue: data.model.numberValue}} title='Field Number State' />
        </ComponentDemo>

        <ComponentDemo component='FieldRadioGroup' title='Field Radio Group'>
            <div class='demo-grid'>
                <FieldRadioGroup
                    label='Choose an option'
                    onChange={(v) => data.model.radioValue = v}
                    options={[
                        ['option1', 'Option 1'],
                        ['option2', 'Option 2'],
                        ['option3', 'Option 3'],
                    ]}
                    value={data.model.radioValue}
                />
            </div>
            <StateView state={{radioValue: data.model.radioValue}} title='Field Radio Group State' />
        </ComponentDemo>

        <ComponentDemo component='FieldSlider' title='Field Slider'>
            <div class='demo-grid'>
                <div style={{alignItems: 'center', display: 'flex', height: '150px', justifyContent: 'center'}}>
                    <FieldSlider
                        IconComponent={Icon}
                        onChange={(v) => {
                            data.model.sliderValue = {...v, locked: v.locked ?? false}
                        }}
                        value={{...data.model.sliderValue, locked: data.model.sliderValue.locked ?? false}}
                    />
                </div>
            </div>
            <StateView state={{sliderValue: data.model.sliderValue}} title='Field Slider State' />
        </ComponentDemo>

        <ComponentDemo component='FieldTextarea' title='Field Textarea'>
            <div class='demo-grid'>
                <FieldTextarea
                    label='Enter text'
                    onChange={(v) => data.model.textareaValue = v}
                    value={data.model.textareaValue}
                />
                <FieldTextarea
                    label='With placeholder'
                    onChange={(v) => data.model.textareaValue = v}
                    placeholder='Type something here...'
                    value={data.model.textareaValue}
                />
            </div>
            <StateView state={{textareaValue: data.model.textareaValue}} title='Field Textarea State' />
        </ComponentDemo>

        <ComponentDemo component='FieldMultiSelect' title='Field Multi Select'>
            <div class='demo-grid'>
                <FieldMultiSelect
                    label='Select multiple'
                    onChange={(v) => data.model.multiSelectValue = v}
                    options={[
                        {id: 'item1', name: 'Item 1'},
                        {id: 'item2', name: 'Item 2'},
                        {id: 'item3', name: 'Item 3'},
                        {id: 'item4', name: 'Item 4'},
                    ]}
                    value={data.model.multiSelectValue}
                />
            </div>
            <StateView state={{multiSelectValue: data.model.multiSelectValue}} title='Field Multi Select State' />
        </ComponentDemo>

        <ComponentDemo component='ContextInput' title='Context Input'>
            <div class='demo-grid'>
                <ContextInput
                    FieldTextComponent={FieldText}
                    submit={(text) => {
                        console.log('Submitted:', text)
                        data.model.contextInput = text
                    }}
                    value={{icon: 'send', title: 'Send Message'}}
                />
            </div>
            <StateView state={{contextInput: data.model.contextInput}} title='Context Input State' />
        </ComponentDemo>

        <ComponentDemo component='ContextSelect' title='Context Select'>
            <div class='demo-grid'>
                <ContextSelect
                    FieldSelectComponent={FieldSelect}
                    icon='settings'
                    options={[
                        {id: 'option1', name: 'Option 1'},
                        {id: 'option2', name: 'Option 2'},
                        {id: 'option3', name: 'Option 3'},
                    ]}
                    submit={(v) => {
                        console.log('Selected:', v)
                        data.model.contextSelectValue = v
                    }}
                    title='Select an option'
                    value={data.model.contextSelectValue}
                />
            </div>
            <StateView state={{contextSelectValue: data.model.contextSelectValue}} title='Context Select State' />
        </ComponentDemo>
</div>
