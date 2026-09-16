with open("/home/wwwroot/AI/vhost/go.koyosim.com.conf", "r", encoding="utf-8") as f:
    content = f.read()

static_block = """    # ????????????
    location /_next/static/ {
        alias /home/wwwroot/AI/domain/go.koyosim.com/web/.next/static/;
        expires 365d;
        access_log off;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location / {"""

if "location /_next/static/" not in content:
    new_content = content.replace("    location / {", static_block, 1)
    with open("/home/wwwroot/AI/vhost/go.koyosim.com.conf", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Updated successfully")
else:
    print("Already configured")
