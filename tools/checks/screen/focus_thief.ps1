# A small window in the bottom-right corner that takes the focus, so Zen
# becomes the inactive window (what Windows' backdrop does then).
param([int]$Seconds = 8)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$form = New-Object System.Windows.Forms.Form
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(1100, 560)
$form.Size = New-Object System.Drawing.Size(240, 120)
$form.Text = 'Focus thief'
$form.TopMost = $true
$form.add_Shown({ $form.Activate() })
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = $Seconds * 1000
$timer.add_Tick({ $form.Close() })
$timer.Start()
[System.Windows.Forms.Application]::Run($form)
