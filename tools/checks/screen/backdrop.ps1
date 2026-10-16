# A bright, busy window to put behind Zen when checking what shows through
# it (Zenith's see-through settings): wide coloured stripes and big text, so
# a blur, a tint or a plain grey are easy to tell apart in a screenshot.
# Closes itself after -Seconds.
param([int]$Seconds = 120, [string]$Style = 'stripes')
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(0, 0)
$form.Size = New-Object System.Drawing.Size(1366, 720)
$form.ShowInTaskbar = $false
$form.Text = 'Zenith backdrop'
$form.add_Paint({
    param($s, $e)
    $g = $e.Graphics
    if ($Style -eq 'document') {
        # Like an ordinary app: a white page of dark text.
        $g.Clear([System.Drawing.Color]::White)
        $font = New-Object System.Drawing.Font('Segoe UI', 13)
        for ($y = 20; $y -lt 700; $y += 26) {
            $g.DrawString('An ordinary app behind Zen: plain text on a white page, line after line after line.', $font, [System.Drawing.Brushes]::Black, 12, $y)
        }
        return
    }
    $colours = 'OrangeRed', 'Gold', 'LimeGreen', 'DeepSkyBlue', 'MediumOrchid', 'White', 'Black'
    for ($i = 0; $i -lt 20; $i++) {
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromName($colours[$i % $colours.Count]))
        $g.FillRectangle($brush, $i * 70, 0, 70, 720)
    }
    $font = New-Object System.Drawing.Font('Segoe UI', 64, [System.Drawing.FontStyle]::Bold)
    $g.DrawString('BEHIND ZEN', $font, [System.Drawing.Brushes]::Black, 40, 280)
})
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $Seconds * 1000
$timer.add_Tick({ $form.Close() })
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
