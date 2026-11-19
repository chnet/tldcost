---
title: Privacy policy
slug: datenschutz
lang: en
source_sha256: '5e03b29bc566ea3613d3b80624303d2390cc4b51feb1db1cfb5c7d9805061e67'
---

<!--
English translation of docs/pages/datenschutz.md (archive issue 33). The page template puts "This is a
translation. The German version is binding." in front of the text. Like the German text, it
describes only what tldcost actually does (infra/lib/site-stack.ts, site/tests/e2e/privacy.spec.ts).
Change this file together with the German one; source_sha256 is the sha256 of the German file
this text was translated from.
-->

# Privacy policy

## Summary

- **No cookies, no local storage, no tracking, no analytics tools.**
- No fonts, scripts or images from other servers.
- No login, no contact form, no newsletter, no chatbot.
- We do not keep access logs. Only our hosting provider processes the connection data that is technically needed to deliver the site.
- Error reports and corrections reach us through GitHub or by email. The repository has been public since 19 Nov 2026.

## 1. Controller

CHnet Solutions Plus UG (haftungsbeschränkt), represented by the managing director Christian Holbein
Bahnhofstr. 2, 37339 Breitenworbis, Germany
Email: [hello@chnet.solutions](mailto:hello@chnet.solutions)

Contact for data protection questions: [privacy@chnet.solutions](mailto:privacy@chnet.solutions)

No data protection officer has been appointed (not required under Art. 37 GDPR / § 38 BDSG, Bundesdatenschutzgesetz, German Federal Data Protection Act).

Further details: [Legal notice](/en/impressum/).

## 2. Hosting and delivery

The website consists of static files only. They are hosted by Amazon Web Services (AWS):

- **Amazon S3** stores the files in the AWS region eu-west-1 (Ireland).
- **Amazon CloudFront** delivers them. CloudFront is a worldwide network of servers. A request is usually answered by the nearest server; for requests from Germany, as a rule by a server in Europe. Processing outside the EU cannot be ruled out.

The contracting party is Amazon Web Services EMEA SARL, 38 Avenue John F. Kennedy, L-1855 Luxembourg. A data processing agreement pursuant to Art. 28 GDPR is in place with AWS (the AWS GDPR Data Processing Addendum, part of the AWS Service Terms).

**Connection data:** so that your browser receives the page, AWS processes technically necessary data, above all your IP address, plus the time, the requested address and the browser identifier. AWS uses this data to deliver the site and to protect it against attacks.

**No access logs:** we have not switched on the access logs of CloudFront and S3. So we do not store logs with IP addresses and do not analyse requests.

**Legal basis:** Art. 6(1)(f) GDPR. Our legitimate interest is the secure and stable delivery of the website.

**Third countries:** where CloudFront processes data outside the EU, the standard contractual clauses in the data processing agreement with AWS apply. AWS is also certified under the EU-US Data Privacy Framework (Art. 45 GDPR).

## 3. No cookies, nothing stored on your device

We do not set cookies and use neither local storage nor session storage. We store nothing on your device and read nothing from it. Your settings in the table (TLD, sorting, columns, gross/net) exist only in the address (URL) of the page. That is why there is no cookie notice.

## 4. No tracking, no third-party content

- We use no analytics or tracking tools, no advertising and no social media plugins.
- The website loads no fonts, scripts, images or other content from other servers. All files come from tldcost itself.

An automated test in the repository checks with every change that the site sets no cookies, stores nothing in the browser and sends no requests to other servers.

## 5. Links to providers

The table links the providers’ price pages directly and without tracking parameters. Only when you follow a link does your browser open the provider’s page. The provider’s privacy policy applies there.

## 6. Public data interface (API)

The price data is also available as static files under `/api/v1/`. The interface needs no login and no key and contains no personal data. Requests to it are treated the same way as requests to the website (section 2).

## 7. Reporting errors

The repository chnet/tldcost has been public since 19 Nov 2026. The “Report an error” link leads to a form on GitHub; without a GitHub account you can reach us by email, and section 8 applies to that. On GitHub we take corrections and notes as issues and pull requests. For GitHub:

- The link passes only details of the table row (provider, TLD) to the email or to the form on GitHub, no data about you.
- To contribute you need an account with GitHub (GitHub, Inc., USA). The [GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) applies on GitHub.
- Issues and pull requests are **public** and show your GitHub name. Please do not enter personal data there that should not be public.
- We process your details to check the report and to correct the data. Legal basis: Art. 6(1)(f) GDPR. Our legitimate interest is correct and traceable data.
- Contributions remain part of the project’s public history.

## 8. Contact by email

If you send us an email, we process your address and your message to answer the request. Legal basis: Art. 6(1)(f) GDPR; for requests about a contract, Art. 6(1)(b) GDPR. We delete the data once the request has been dealt with and no statutory retention obligations apply.

Emails to our addresses (hello@, privacy@) are processed via Microsoft Exchange Online (Microsoft Ireland Operations Ltd.). The data processing agreement with Microsoft applies.

## 9. Your rights

You have the right to

- access (Art. 15 GDPR),
- rectification (Art. 16 GDPR),
- erasure (Art. 17 GDPR),
- restriction of processing (Art. 18 GDPR),
- data portability (Art. 20 GDPR),
- object to processing based on Art. 6(1)(f) GDPR (Art. 21 GDPR).

Please send requests to [privacy@chnet.solutions](mailto:privacy@chnet.solutions).

## 10. Right to lodge a complaint

You can lodge a complaint with a data protection supervisory authority (Art. 77 GDPR). The authority responsible for us is the Thuringian State Commissioner for Data Protection and Freedom of Information (Thüringer Landesbeauftragter für den Datenschutz und die Informationsfreiheit, TLfDI), as the controller has its registered office in Breitenworbis (Thuringia).

## 11. Changes

We update this privacy policy when the technology of tldcost or the legal situation changes.

Last updated: 14 Nov 2026
