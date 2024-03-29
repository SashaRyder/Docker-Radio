# Docker Radio

### 24/7 Radio Station, all contained within a docker container!

## [See it in action! - https://phonk.live](https://phonk.live)

## Setup:

### Example docker-compose.yml

```
version: '3.7'
services:
  caster:
    image: ghcr.io/sasharyder/docker-radio
    environment:
      ICECAST_PASSWORD: password
    container_name: caster
    restart: unless-stopped
    ports:
      - 4000:4000 #If you're using the reverse proxy, you don't need to expose any ports
    volumes:
      - ./data/public:/app/data/public
      - ./data/playlist.txt:/etc/ices2/playlist.txt
      - ./data/songs:/etc/ices2/songs
```

### NGINX reverse proxy config

```
server {
        listen        443 ssl http2;
        server_name   myradiostation.live; #REPLACE THIS WITH YOUR RADIO STATION DOMAIN!

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Sec-WebSocket-Extensions $http_sec_websocket_extensions;
        proxy_set_header Sec-WebSocket-Key $http_sec_websocket_key;
        proxy_set_header Sec-WebSocket-Version $http_sec_websocket_version;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";

        proxy_max_temp_file_size 0;

        location /socket/ {
                resolver 127.0.0.11 valid=30s;
                set $upstream_url caster;
                proxy_pass http://$upstream_url:4000;
                proxy_http_version 1.1;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection 'upgrade';
                proxy_set_header Host $host;
                proxy_cache_bypass $http_upgrade;
        }
        location / {
                resolver 127.0.0.11 valid=30s;
                set $upstream_url caster;
                proxy_pass http://$upstream_url:4000;
        }
}
```

### Configuration (READ THIS, VERY IMPORTANT!)

Check `data_example` for example on how your `data` folder should be laid out! Edit `data/public/config.json` to make sure your configuration is correct, then add a `bg.mp4` for a background! All the other stuff is manifest files and not required, but makes your users experience better

### Converting MP3s to Vorbis OGG

```
  for f in **/*.mp3; do
    song_name="$(basename "$f")";
    ffmpeg -vn -i "$f" -c:a libvorbis -q:a 4 "songs/${song_name/%mp3/ogg}";
  done
```

### Creating playlist.txt from songs

```
  find songs/ > playlist.txt
```

## Things you should know:

- songs within `/etc/ices2/songs` must be `.ogg`, and they should have metadata for artist/title
- the MPEG stream is a backup, webkit devices (iOS/Mac OSX) doesn't support OGG for whatever reason, if you dont care about iOS devices you can edit `start.sh` and remove the FFMPEG relay
- with the example `docker-compose.yml` the icecast admin panel isnt exposed, therefore the ICECAST_PASSWORD does not need to be secure. You probably don't even need one, but it doesn't hurt to have
