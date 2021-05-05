const request = require('request')
const uuid = require('uuid/v1')
let api_url = 'https://authserver.mojang.com'

module.exports.getAuth = function (username, password) {
  return new Promise((resolve, reject) => {
    if (!password) {
      const user = {
        access_token: uuid(),
        client_token: uuid(),
        uuid: uuid(),
        name: username,
        user_properties: '{}'
      }

      return resolve(user)
    }

    const requestObject = {
      url: api_url + '/authenticate',
      json: {
        agent: {
          name: 'Minecraft',
          version: 1
        },
        username: username,
        password: password,
        clientToken: uuid(),
        requestUser: true
      }
    }

    request.post(requestObject, function (error, response, body) {
      if (error) return reject(error)
      if (!body || !body.selectedProfile) {
        return reject(new Error('Validation error: ' + response.statusMessage))
      }

      const userProfile = {
        access_token: body.accessToken,
        client_token: body.clientToken,
        uuid: body.selectedProfile.id,
        name: body.selectedProfile.name,
        selected_profile: body.selectedProfile,
        user_properties: parsePropts(body.user.properties)
      }

      resolve(userProfile)
    })
  })
}

module.exports.validate = function (access_token, client_token) {
  return new Promise((resolve, reject) => {
    const requestObject = {
      url: api_url + '/validate',
      json: {
        accessToken: access_token,
        clientToken: client_token
      }
    }

    request.post(requestObject, async function (error, response, body) {
      if (error) return reject(error)

      if (!body) resolve(true)
      else reject(body)
    })
  })
}

module.exports.refreshAuth = function (accessToken, clientToken, selectedProfile) {
  return new Promise((resolve, reject) => {
    const requestObject = {
      url: api_url + '/refresh',
      json: {
        accessToken: accessToken,
        clientToken: clientToken,
        selectedProfile: selectedProfile,
        requestUser: true
      }
    }

    request.post(requestObject, function (error, response, body) {
      if (error) return reject(error)
      if (!body || !body.selectedProfile) {
        return reject(new Error('Validation error: ' + response.statusMessage))
      }

      const userProfile = {
        access_token: body.accessToken,
        client_token: uuid(),
        uuid: body.selectedProfile.id,
        name: body.selectedProfile.name,
        user_properties: parsePropts(body.user.properties)
      }

      resolve(userProfile)
    })
  })
}

module.exports.invalidate = function (accessToken, clientToken) {
  return new Promise((resolve, reject) => {
    const requestObject = {
      url: api_url + '/invalidate',
      json: {
        accessToken: accessToken,
        clientToken: clientToken
      }
    }

    request.post(requestObject, function (error, response, body) {
      if (error) return reject(error)

      if (!body) resolve(true)
      else reject(body)
    })
  })
}

module.exports.signOut = function (username, password) {
  return new Promise((resolve, reject) => {
    const requestObject = {
      url: api_url + '/signout',
      json: {
        username: username,
        password: password
      }
    }

    request.post(requestObject, function (error, response, body) {
      if (error) return reject(error)

      if (!body) resolve(true)
      else reject(body)
    })
  })
}

module.exports.changeApiUrl = function (url) {
  api_url = url
}

function parsePropts (array) {
  if (array) {
    const newObj = {}
    for (const entry of array) {
      if (newObj[entry.name]) {
        newObj[entry.name].push(entry.value)
      } else {
        newObj[entry.name] = [entry.value]
      }
    }
    return JSON.stringify(newObj)
  } else {
    return '{}'
  }
}
