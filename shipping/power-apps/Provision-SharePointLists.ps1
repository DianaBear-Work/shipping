[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$SiteUrl,

  [Parameter(Mandatory = $true)]
  [string]$TenantId,

  [Parameter(Mandatory = $true)]
  [string]$ClientId,

  [string]$FacilityName = 'Williamston, SC'
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Module -ListAvailable -Name PnP.PowerShell)) {
  throw 'PnP.PowerShell is required. Install it with: Install-Module PnP.PowerShell -Scope CurrentUser'
}

Connect-PnPOnline -Url $SiteUrl -Interactive -Tenant $TenantId -ClientId $ClientId

function Ensure-List {
  param([Parameter(Mandatory = $true)][string]$Name)

  $list = Get-PnPList -Identity $Name -ErrorAction SilentlyContinue
  if (-not $list) {
    New-PnPList -Title $Name -Template GenericList -OnQuickLaunch:$false | Out-Null
    $list = Get-PnPList -Identity $Name
    Write-Host "Created list: $Name"
  } else {
    Write-Host "List already exists: $Name"
  }

  return $list
}

function Ensure-Field {
  param(
    [Parameter(Mandatory = $true)][string]$List,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$DisplayName,
    [Parameter(Mandatory = $true)][string]$Type,
    [string[]]$Choices,
    [string]$LookupListId,
    [string]$LookupField,
    [bool]$Required = $false,
    [bool]$Indexed = $false,
    [bool]$Unique = $false,
    [string]$DefaultValue
  )

  $field = Get-PnPField -List $List -Identity $Name -ErrorAction SilentlyContinue
  if (-not $field) {
    if ($Type -eq 'Lookup') {
      if (-not $LookupListId -or -not $LookupField) {
        throw "Lookup field $List.$Name requires a target list and field."
      }

      $xml = '<Field Type="Lookup" Name="{0}" StaticName="{0}" DisplayName="{1}" List="{{{2}}}" ShowField="{3}" Required="{4}" />' -f `
        $Name, [System.Security.SecurityElement]::Escape($DisplayName), $LookupListId, $LookupField, $Required.ToString().ToUpperInvariant()
      Add-PnPFieldFromXml -List $List -FieldXml $xml | Out-Null
    } else {
      $parameters = @{
        List        = $List
        DisplayName = $DisplayName
        InternalName = $Name
        Type        = $Type
      }
      if ($Required) {
        $parameters.Required = $true
      }
      if ($Choices) {
        $parameters.Choices = $Choices
      }
      Add-PnPField @parameters | Out-Null
    }
    Write-Host "  Added $Name"
  }

  $values = @{}
  if ($Indexed) {
    $values.Indexed = $true
  }
  if ($Unique) {
    $values.EnforceUniqueValues = $true
    $values.Indexed = $true
  }
  if ($DefaultValue) {
    $values.DefaultValue = $DefaultValue
  }
  if ($values.Count -gt 0) {
    Set-PnPField -List $List -Identity $Name -Values $values
  }
}

function Ensure-TextField {
  param(
    [string]$List,
    [string]$Name,
    [string]$DisplayName = $Name,
    [bool]$Required = $false,
    [bool]$Indexed = $false,
    [bool]$Unique = $false
  )
  Ensure-Field -List $List -Name $Name -DisplayName $DisplayName -Type Text `
    -Required $Required -Indexed $Indexed -Unique $Unique
}

$locations = Ensure-List -Name 'ShippingLocations'
Ensure-List -Name 'PackageTracking' | Out-Null
Ensure-List -Name 'PackageLocationHistory' | Out-Null
Ensure-List -Name 'PackageStatusHistory' | Out-Null
Ensure-List -Name 'PackageNotifications' | Out-Null

foreach ($listName in @('PackageTracking', 'PackageLocationHistory', 'PackageStatusHistory', 'PackageNotifications')) {
  Set-PnPField -List $listName -Identity 'Title' -Values @{ Required = $false }
}

$locationCategories = @(
  'Shipping & Receiving',
  'Warehouse',
  'IT Department',
  'HR Office',
  'Front Office',
  'Maintenance',
  'Quality',
  'Production',
  'Other',
  'Unknown / Needs Sorting'
)

$packageStatuses = @(
  'Expected',
  'Received',
  'Needs Sorting',
  'Stored',
  'Ready for Pickup',
  'Out for Delivery',
  'Delivered',
  'Picked Up',
  'Returned',
  'Exception'
)

$carriers = @('UPS', 'FedEx', 'USPS', 'DHL', 'Other')
$auditActions = @(
  'Package Registered',
  'Package Received',
  'Status Changed',
  'Picked Up',
  'Delivered',
  'Returned',
  'Exception'
)

Ensure-TextField -List 'ShippingLocations' -Name 'Facility' -Required $true -Indexed $true
Ensure-Field -List 'ShippingLocations' -Name 'Category' -DisplayName 'Category' -Type Choice `
  -Choices $locationCategories -Required $true
Ensure-TextField -List 'ShippingLocations' -Name 'StorageArea'
Ensure-TextField -List 'ShippingLocations' -Name 'Shelf'
Ensure-TextField -List 'ShippingLocations' -Name 'Row'
Ensure-TextField -List 'ShippingLocations' -Name 'Room'
Ensure-TextField -List 'ShippingLocations' -Name 'Desk'
Ensure-Field -List 'ShippingLocations' -Name 'Directions' -DisplayName 'Additional directions' -Type Note
Ensure-Field -List 'ShippingLocations' -Name 'IsActive' -DisplayName 'Active' -Type Boolean -DefaultValue '1'

Ensure-TextField -List 'PackageTracking' -Name 'PackageID' -DisplayName 'Package ID' `
  -Required $true -Indexed $true -Unique $true
Ensure-Field -List 'PackageTracking' -Name 'Carrier' -DisplayName 'Carrier' -Type Choice `
  -Choices $carriers -Required $true
Ensure-TextField -List 'PackageTracking' -Name 'TrackingNumber' -DisplayName 'Carrier tracking number' -Indexed $true
Ensure-TextField -List 'PackageTracking' -Name 'RecipientName' -DisplayName 'Recipient name' -Required $true -Indexed $true
Ensure-TextField -List 'PackageTracking' -Name 'RecipientEmail' -DisplayName 'Recipient email' -Required $true -Indexed $true
Ensure-TextField -List 'PackageTracking' -Name 'Department' -Required $true
Ensure-TextField -List 'PackageTracking' -Name 'Facility' -Required $true -Indexed $true
Ensure-Field -List 'PackageTracking' -Name 'DateReceived' -DisplayName 'Date received' -Type DateTime
Ensure-Field -List 'PackageTracking' -Name 'ReceivedBy' -DisplayName 'Received by' -Type User
Ensure-Field -List 'PackageTracking' -Name 'Description' -DisplayName 'Package description' -Type Note
Ensure-Field -List 'PackageTracking' -Name 'Quantity' -DisplayName 'Package quantity' -Type Number -DefaultValue '1'
Ensure-Field -List 'PackageTracking' -Name 'Notes' -DisplayName 'Additional notes' -Type Note
Ensure-Field -List 'PackageTracking' -Name 'CurrentLocation' -DisplayName 'Current location' -Type Lookup `
  -LookupListId $locations.Id -LookupField 'Title' -Indexed $true
Ensure-TextField -List 'PackageTracking' -Name 'LocationDetails' -DisplayName 'Location details'
Ensure-Field -List 'PackageTracking' -Name 'Status' -DisplayName 'Status' -Type Choice `
  -Choices $packageStatuses -Required $true -Indexed $true -DefaultValue 'Expected'
Ensure-Field -List 'PackageTracking' -Name 'ExpectedDeliveryDate' -DisplayName 'Expected delivery date' -Type DateTime
Ensure-Field -List 'PackageTracking' -Name 'ReceivedAt' -DisplayName 'Received at' -Type DateTime
Ensure-Field -List 'PackageTracking' -Name 'PickedUpBy' -DisplayName 'Picked up by' -Type User
Ensure-Field -List 'PackageTracking' -Name 'PickedUpAt' -DisplayName 'Picked up at' -Type DateTime

foreach ($historyList in @('PackageLocationHistory', 'PackageStatusHistory')) {
  Ensure-TextField -List $historyList -Name 'ActionID' -DisplayName 'Action ID' `
    -Required $true -Indexed $true -Unique $true
  Ensure-TextField -List $historyList -Name 'PackageID' -DisplayName 'Package ID' -Required $true -Indexed $true
  Ensure-Field -List $historyList -Name 'ChangedAt' -DisplayName 'Date and time' -Type DateTime -Required $true
  Ensure-Field -List $historyList -Name 'Employee' -DisplayName 'Employee responsible' -Type User -Required $true
  Ensure-Field -List $historyList -Name 'Notes' -DisplayName 'Notes' -Type Note
}

Ensure-Field -List 'PackageLocationHistory' -Name 'PreviousLocation' -DisplayName 'Previous location' -Type Lookup `
  -LookupListId $locations.Id -LookupField 'Title'
Ensure-Field -List 'PackageLocationHistory' -Name 'NewLocation' -DisplayName 'New location' -Type Lookup `
  -LookupListId $locations.Id -LookupField 'Title' -Required $true
Ensure-TextField -List 'PackageLocationHistory' -Name 'PreviousLocationDetails' -DisplayName 'Previous location details'
Ensure-TextField -List 'PackageLocationHistory' -Name 'NewLocationDetails' -DisplayName 'New location details'

Ensure-Field -List 'PackageStatusHistory' -Name 'Action' -DisplayName 'Action' -Type Choice `
  -Choices $auditActions -Required $true
Ensure-Field -List 'PackageStatusHistory' -Name 'PreviousStatus' -DisplayName 'Previous status' -Type Choice -Choices $packageStatuses
Ensure-Field -List 'PackageStatusHistory' -Name 'NewStatus' -DisplayName 'New status' -Type Choice -Choices $packageStatuses

Ensure-TextField -List 'PackageNotifications' -Name 'PackageID' -DisplayName 'Package ID' -Required $true -Indexed $true
Ensure-TextField -List 'PackageNotifications' -Name 'NotificationKey' -DisplayName 'Notification key' `
  -Required $true -Indexed $true -Unique $true
Ensure-TextField -List 'PackageNotifications' -Name 'RecipientEmail' -DisplayName 'Recipient email' -Required $true
Ensure-TextField -List 'PackageNotifications' -Name 'NotificationType' -DisplayName 'Notification type' -Required $true
Ensure-Field -List 'PackageNotifications' -Name 'SentAt' -DisplayName 'Sent at' -Type DateTime
Ensure-Field -List 'PackageNotifications' -Name 'SendStatus' -DisplayName 'Send status' -Type Choice `
  -Choices @('Pending', 'Sent', 'Failed', 'Skipped') -Required $true
Ensure-TextField -List 'PackageNotifications' -Name 'FlowRunId' -DisplayName 'Power Automate run ID'
Ensure-Field -List 'PackageNotifications' -Name 'Details' -DisplayName 'Details' -Type Note

$defaultLocations = @(
  @{ Title = 'Shipping & Receiving'; Category = 'Shipping & Receiving' },
  @{ Title = 'Warehouse'; Category = 'Warehouse' },
  @{ Title = 'IT Department'; Category = 'IT Department' },
  @{ Title = 'HR Office'; Category = 'HR Office' },
  @{ Title = 'Front Office'; Category = 'Front Office' },
  @{ Title = 'Maintenance'; Category = 'Maintenance' },
  @{ Title = 'Quality'; Category = 'Quality' },
  @{ Title = 'Production'; Category = 'Production' },
  @{ Title = 'Other'; Category = 'Other' },
  @{ Title = 'Unknown / Needs Sorting'; Category = 'Unknown / Needs Sorting' }
)

foreach ($location in $defaultLocations) {
  $title = "$FacilityName - $($location.Title)"
  $existing = Get-PnPListItem -List 'ShippingLocations' -Fields 'Title' |
    Where-Object { $_['Title'] -eq $title } |
    Select-Object -First 1
  if (-not $existing) {
    Add-PnPListItem -List 'ShippingLocations' -Values @{
      Title    = $title
      Facility = $FacilityName
      Category = $location.Category
      IsActive = $true
    } | Out-Null
    Write-Host "  Added location: $title"
  }
}

Write-Host ''
Write-Host 'SharePoint list structure is ready. No package or employee records were created.'
Write-Host 'Review power-apps/README.md before granting access or building the app and flows.'
