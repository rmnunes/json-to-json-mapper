[![Node.js Package](https://github.com/rmnunes/json-to-json-mapper/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/rmnunes/json-to-json-mapper/actions/workflows/npm-publish.yml)
# JSON Auto-mapper

## How to use?

use the function `map(jsonObject, mappingsDefinition, saveToFile);`

- jsonObject: is your json file parsed to json object
- mappingsDefinition: is a list of mappings, see below
- saveToFile: true/false if you want to save the resolts to a file

### Exemple 1
```
//input
{
    request: {
        order:{
            id: "1"
        }
    }
}

//map
{
    source: "request.order.id",
    target: "app.ordering.number",
}

//output
{
    app: {
        ordering:{
            number: 1
        }
    }
}

```

### Exemple 2
```
//input
{
    request: {
        order:[{
            id: "1"
        }]
    }
}

//map
{
    source: "request.order.id",
    target: "app.ordering.number",
    format: Number,
    take: 1
}

//output
{
    app: {
        ordering:{
            number: 1
        }
    }
}
```

### Exemple 3
```
//input
{
    request: {
        order:[{
            id: "1",
            code: "2"
        }]
    }
}

//map
Enum EnumObject{
    A = 1,
    B = 2
}

{
    source: "request.order.code",
    target: "app.ordering.text",
    enum: EnumObject,
}

//output
{
    app: {
        ordering:{
            text: "A"
        }
    }
}
```

### Exemple 4
```
//input
{
    request: {
        order:[{
            id: "1",
            code: "2"
        }]
    }
}

//map
{
    source: "request.order.id",
    target: "app.ordering.$.number.id",
    format: Number,
}

//output
{
    app: {
        ordering: [
            {
                number: {
                    id: 1,
                },
            },
        ],
    },
}
```