"""The seller's PUBLIC key: Hessa.exe checks every activation and reset code with it (server/license.py).
Public = safe to publish; it can only check codes, never make them. The matching private key is kept by the seller
(tools/seller.py init). Replacing this key makes every code made with the old one stop working - only with a new build."""
PUBLIC_KEY = '95bc7fd139eb6c024ccd3ccb20b756af29c9db165b74e03b7e2608fb7708dc86'
