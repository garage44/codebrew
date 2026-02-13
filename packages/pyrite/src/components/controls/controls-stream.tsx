// Legacy stream controls template - may not be actively used
export const StreamControls = () => {
    return (
        <div class='invisible' id='videocontrols-template'>
            <div class='video-controls vc-overlay'>
                <div class='controls-button controls-left'>
                    <span class='video-play' title='Play video'>
                        <i class='fas fa-play' />
                    </span>
                    <span class='volume' title='Volume'>
                        <i aria-hidden='true' class='fas fa-volume-up volume-mute' />
                        <input class='volume-slider' max='100' min='0' step='5' type='range' value='100' />
                    </span>
                </div>
                <div class='controls-button controls-right'>
                    <span class='pip' title='Picture In Picture'>
                        <i aria-hidden='true' class='far fa-clone' />
                    </span>
                    <span class='fullscreen' title='Fullscreen'>
                        <i aria-hidden='true' class='fas fa-expand' />
                    </span>
                </div>
            </div>
        </div>
    )
}
