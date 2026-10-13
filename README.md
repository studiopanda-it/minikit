`minikit.config.json`
```
[
	{
		"src": "static/scss",
		"out": "static"
	},
	{
		"src": "static/js",
		"out": "static",
		"sourcemap": false
	},
	...
]
```

Each entry accepts the following properties:

| Property    | Required | Default                                                                   | Description                                                                 |
| ----------- | -------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src`       | yes      |                                                                           | Directory to watch for `.js`, `.scss` and `.sass` files                     |
| `out`       | yes      |                                                                           | Directory where compiled files are written                                  |
| `browsers`  | no       | `["last 2 Chrome versions", "last 2 Firefox versions", "Safari >= 13"]`   | Browserslist targets used by Babel and Autoprefixer                         |
| `sourcemap` | no       | `true`                                                                    | Set to `false` to skip generating `.map` files for both JS and CSS output   |

To launch watcher:
`npx @studiopanda/minikit`
