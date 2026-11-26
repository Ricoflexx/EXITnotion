// EXITnotion op Azure: App Service (Linux, Node 22), PostgreSQL Flexible Server en een Storage-account voor uploads.
// Uitrollen: zie docs/azure-setup.md (workflow "Infrastructuur" of az deployment group create).

@description('Regio. West Europe ligt het dichtst bij en houdt data in de EU.')
param location string = 'westeurope'

@description('Korte naam; wordt gebruikt in alle resourcenamen. Alleen kleine letters en cijfers.')
@minLength(3)
@maxLength(14)
param name string = 'exitnotion'

@description('Publieke URL van de app, zonder slash aan het eind. Bijvoorbeeld https://werkplek.dutchtoysgroup.com')
param appUrl string

@description('Beheerdersnaam van de PostgreSQL-server.')
param postgresAdminLogin string = 'exitnotionadmin'

@secure()
@description('Wachtwoord van de PostgreSQL-beheerder.')
param postgresAdminPassword string

@secure()
@description('Willekeurige geheime sleutel voor sessies (openssl rand -base64 32).')
param authSecret string

@description('Directory (tenant) ID van EXIT in Entra ID.')
param entraTenantId string

@description('Application (client) ID van de app-registratie.')
param entraClientId string

@secure()
@description('Client secret van de app-registratie.')
param entraClientSecret string

@description('Object-ID van de Entra-groep EXITnotion-Beheerders.')
param adminGroupId string

@description('App Service-plan. B1 is genoeg voor een handvol gebruikers.')
param appServiceSku string = 'B1'

var suffix = uniqueString(resourceGroup().id)
var dbName = 'exitnotion'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${name}-plan'
  location: location
  sku: { name: appServiceSku }
  kind: 'linux'
  properties: { reserved: true }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: '${name}-db-${suffix}'
  location: location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32, autoGrow: 'Enabled' }
    // R82: back-ups 35 dagen terug te zetten (maximum).
    backup: { backupRetentionDays: 35, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: postgres
  name: dbName
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

// Alleen verkeer vanuit Azure-diensten (zoals de App Service). Strakker kan met een VNet; zie docs/azure-setup.md.
resource postgresFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('${name}st${suffix}', 24)
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: { enabled: true, days: 30 }
  }
}

resource uploads 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'uploads'
  properties: { publicAccess: 'None' }
}

resource app 'Microsoft.Web/sites@2023-12-01' = {
  name: '${name}-${suffix}'
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22-lts'
      appCommandLine: 'bash startup.sh'
      alwaysOn: true
      webSocketsEnabled: true // nodig voor live samen bewerken (versie 1.1)
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      healthCheckPath: '/login'
      appSettings: [
        { name: 'NODE_ENV', value: 'production' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
        {
          name: 'DATABASE_URL'
          value: 'postgres://${postgresAdminLogin}:${uriComponent(postgresAdminPassword)}@${postgres.properties.fullyQualifiedDomainName}:5432/${dbName}?sslmode=require'
        }
        { name: 'AUTH_SECRET', value: authSecret }
        { name: 'AUTH_URL', value: appUrl }
        { name: 'AUTH_TRUST_HOST', value: 'true' }
        { name: 'AUTH_MICROSOFT_ENTRA_ID_ID', value: entraClientId }
        { name: 'AUTH_MICROSOFT_ENTRA_ID_SECRET', value: entraClientSecret }
        { name: 'AUTH_MICROSOFT_ENTRA_ID_ISSUER', value: '${environment().authentication.loginEndpoint}${entraTenantId}/v2.0' }
        { name: 'ADMIN_GROUP_ID', value: adminGroupId }
        { name: 'AZURE_STORAGE_ACCOUNT', value: storage.name }
        { name: 'AZURE_STORAGE_CONTAINER', value: uploads.name }
        // AUTH_DEV_LOGIN staat hier bewust NIET: de testlogin werkt nooit op Azure.
      ]
    }
  }
}

// De app mag in de uploads-container lezen en schrijven met zijn eigen identiteit (geen sleutels in de configuratie).
resource blobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, app.id, 'blob-contributor')
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: app.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output appName string = app.name
output appDefaultHostName string = app.properties.defaultHostName
output postgresServer string = postgres.properties.fullyQualifiedDomainName
output storageAccount string = storage.name
