# Azure inrichten voor EXITnotion

Voor: Sven (besluit B6). Eenmalig werk; daarna rolt GitHub elke wijziging op `main` vanzelf uit.
Reken op ongeveer een uur, als je rechten hebt in Entra ID en op een Azure-subscription.

## Wat er komt

| Resource | Waarvoor | Grootte |
|---|---|---|
| App Service (Linux, Node 22) | De app zelf | B1 |
| PostgreSQL Flexible Server 16 | Alle pagina's, rechten en het inzagelog. Back-ups 35 dagen. | Burstable B1ms, 32 GB |
| Storage-account, container `uploads` | Afbeeldingen en bestanden (vanaf blok 1) | Standard LRS |

Alles staat in `infra/main.bicep`. Regio: West Europe.

## 1. Resourcegroep

```bash
az group create --name rg-exitnotion --location westeurope
```

## 2. App-registratie voor inloggen (Entra ID)

1. Entra ID → **App registrations** → **New registration**
   - Naam: `EXITnotion`
   - Supported account types: **Accounts in this organizational directory only** (single tenant)
   - Redirect URI (Web): `https://<app-url>/api/auth/callback/microsoft-entra-id`
     Voeg na stap 5 ook de standaard-URL toe: `https://<appnaam>.azurewebsites.net/api/auth/callback/microsoft-entra-id`
2. **Certificates & secrets** → New client secret. Bewaar de waarde (`ENTRA_APP_CLIENT_SECRET`).
3. **Token configuration** → **Add groups claim** → *Security groups*, aan voor het **ID**-token.
4. Noteer de **Application (client) ID** (`ENTRA_APP_CLIENT_ID`) en de **Directory (tenant) ID**.

Wil je dat alleen bepaalde mensen kunnen inloggen? Zet in **Enterprise applications → EXITnotion → Properties**
*Assignment required* op **Yes** en wijs gebruikers of een groep toe.

## 3. Beheerdersgroep

Maak een beveiligingsgroep **EXITnotion-Beheerders** en voeg Ricardo (en jezelf) toe.
Noteer de **Object ID** (`ADMIN_GROUP_ID`). Leden zien in de app alle pagina's (R03), en elke inzage wordt gelogd (R93).

## 4. Uitrollen vanuit GitHub zonder wachtwoorden (OIDC)

1. Maak een tweede app-registratie **EXITnotion-GitHub** (dit is de "deployer", niet de login-app).
2. **Certificates & secrets → Federated credentials → Add** → *GitHub Actions deploying Azure resources*:
   - Organization en Repository: de GitHub-organisatie en repository waar de code staat (bijvoorbeeld die van EXIT),
     Entity: **Environment**, naam: `productie`
3. Geef deze app de rol **Contributor** op de resourcegroep `rg-exitnotion`, plus
   **Role Based Access Control Administrator** (alleen nodig omdat Bicep de app toegang geeft tot de opslag).

## 5. GitHub-omgeving "productie"

Repository → Settings → Environments → **New environment**: `productie`. Zet daar:

**Secrets**

| Naam | Waarde |
|---|---|
| `AZURE_CLIENT_ID` | Client ID van **EXITnotion-GitHub** |
| `AZURE_TENANT_ID` | Tenant ID |
| `AZURE_SUBSCRIPTION_ID` | Subscription ID |
| `ENTRA_APP_CLIENT_SECRET` | Client secret van de login-app **EXITnotion** |
| `POSTGRES_ADMIN_PASSWORD` | Een sterk wachtwoord (bewaar het in de wachtwoordmanager) |
| `AUTH_SECRET` | `openssl rand -base64 32` |

**Variables**

| Naam | Waarde |
|---|---|
| `AZURE_RESOURCE_GROUP` | `rg-exitnotion` |
| `APP_URL` | Bijvoorbeeld `https://werkplek.dutchtoysgroup.com` (eerst mag de azurewebsites.net-URL) |
| `ENTRA_APP_CLIENT_ID` | Client ID van de login-app **EXITnotion** |
| `ADMIN_GROUP_ID` | Object ID van **EXITnotion-Beheerders** |
| `AZURE_WEBAPP_NAME` | Komt uit stap 6 (output `appName`) |

Tip: zet bij de omgeving **Required reviewers** aan, dan gaat niets live zonder akkoord.

## 6. Infrastructuur aanmaken

Actions → **Infrastructuur** → *Run workflow*. De output toont `appName` en `appDefaultHostName`.
Zet `appName` in de variable `AZURE_WEBAPP_NAME`, en zet de redirect-URI uit stap 2 goed.

## 7. App uitrollen

Push naar `main`, of Actions → **Uitrollen** → *Run workflow*. Bij het opstarten voert de app zelf de
databasemigraties uit (`startup.sh`). Daarna is hij bereikbaar op de URL.

## 8. Eigen domein (optioneel)

App Service → **Custom domains** → voeg `werkplek.dutchtoysgroup.com` toe (CNAME naar de azurewebsites.net-host),
en kies een gratis **App Service Managed Certificate**. Zet daarna `APP_URL` en de redirect-URI om en draai
**Infrastructuur** opnieuw.

## Beheer en veiligheid

- **Back-ups:** PostgreSQL bewaart 35 dagen point-in-time back-ups. Terugzetten: Azure Portal → de server → *Restore*.
  Verwijderde uploads blijven 30 dagen terug te halen (soft delete).
- **Testlogin:** werkt nooit op Azure. De app schakelt hem uit zodra `WEBSITE_SITE_NAME` bestaat, en Bicep zet `AUTH_DEV_LOGIN` niet.
- **Netwerk:** de database accepteert nu alleen verkeer vanuit Azure-diensten. Strakker kan met VNet-integratie en
  private access. Dat is een goede vervolgstap als de app eenmaal draait.
- **Kosten (indicatie):** App Service B1, PostgreSQL B1ms en opslag samen ongeveer € 30–40 per maand.
