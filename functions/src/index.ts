import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";

import * as cors from 'cors';
const corsHandler = cors({origin: true});
// import cors = require('cors')

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
admin.initializeApp()

let email_from = 'goubi.webmaster@gmail.com'

let transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: email_from,
        pass: 'gmixafjbhypywlly'
    }
});


const messageObject = {
    "gas":{
            title: 'Nuevo Pedido',
            body: 'Nuevo pedido de gas'
        },
    "water":{ 
            title: 'Nuevo Pedido',
            body: 'Nuevo pedido de agua' 
    },
    "recicle":{
            title: 'Nuevo Pedido',
            body: 'Nuevo pedido de reciclaje'
    },

};

const orderIdData= async (orderId: string | number | boolean | null,database:string) =>{
    return new Promise((resolve, reject) =>{
        const ref = admin.database().ref(database).orderByChild('orderid').equalTo(orderId);
        ref.once("value", function(snapshot) {
            snapshot.forEach(function(childSnapshot) {
                resolve(childSnapshot.key);
            });
          });
    })
};

const tokenIdUser = async (userId: string) =>{ 
    const ref = admin.firestore().collection("users").doc(userId);
    const doc = await ref.get();
    return doc.get('tokens') as Array<string>
};

const deg2rad = (deg:number) => {
    return deg * (Math.PI/180)
  }
const checkdistance = (lat1:number,lat2:number,lng1:number,lng2:number)=>{
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2-lat1);  // deg2rad below
    var dLon = deg2rad(lng2-lng1); 
    var a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2)
        ; 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; // Distance in km
    return d;
}

const buildArrayOfTokens = async (type: string,lat:number,lng:number) =>{ 
    const tokenReference = admin.firestore().collection("users").where('type', '==', type).where('status', '==', true);
    const distanceReference = await admin.firestore().collection("settings").doc("data").get();
    const distanceData = distanceReference.get('radio_1') as Number;
    const tokenSnapshot  = await tokenReference.get();
    const results: any[] = [];
    console.log(distanceData)
    tokenSnapshot.forEach(doc => {
        let tmp_data = doc.data();
        let tmpLng = tmp_data.lng ? tmp_data.lng : 38.2340 ;
        let tmpLat = tmp_data.lat ? tmp_data.lat :-100.34230 ;
        let distance = checkdistance(tmpLat,lat,tmpLng,lng);
        if (distance <= distanceData){
            results.push(tmp_data.tokens);
        }
    });
    const tokenIds = await Promise.all(results);
    return tokenIds;

};

export const onOrderCreate = functions.database
.ref('/requests/{orderId}')
.onCreate(async (snapshot,context)=>{
    let message;
    const data = snapshot.val()
    if (data.type == 'gas'){
        message = messageObject['gas']
    }
    else if(data.type == 'water'){
        message = messageObject['water']
    }
    else{
        message = messageObject['recicle']
    }
    const deliveryToken = await buildArrayOfTokens(data.type,data.lat,data.lng);
    if (deliveryToken.length){

        let notifyMessage = {
            notification: message,
            tokens: deliveryToken[0]
        }
        console.log(notifyMessage)
        admin.messaging().sendMulticast(notifyMessage)
        .then((response) => {
            console.log("Successfully sent message:", response);
            return true
        })
        .catch((error) => {
            console.log("Error sending message:", error);
            return false
        }); 
    } 

})


export const onDeleteDeliveryRequest = functions.database
.ref('deliveryProgress/{userui}')
.onDelete(async (snapshot,context) => {
    let message;
    const userui = context.params.userui
    const clientToken = await tokenIdUser(userui as string);
    message = {
        notification: {
            title: 'Mensaje de Plataforma',
            body: 'El pedido fue cancelado'
        },
        tokens: clientToken    
    }
    admin.messaging()
        .sendMulticast(message)
        .then((response) => {
            console.log("Successfully sent message:", response);
            return true
        })
        .catch((error) => {
            console.log("Error sending message:", error);
            return false
        });  
})

export const onChatReceived = functions.database
.ref('/chats/{orderId}/{messageId}')
.onCreate(async (snapshot,context)=> {
    let message;
    const data = snapshot.val()
    
    const orderId = context.params.orderId
    const clientResult = await orderIdData(orderId,"clientProgress");
    const deliveryResult = await orderIdData(orderId,"deliveryProgress");
    const clientToken = await tokenIdUser(clientResult as string);
    const deliveryToken = await tokenIdUser(deliveryResult as string);
    if (data['type'] === 'client'){
        message = {
            notification: {
                title: 'Mensaje de Cliente',
                body: data['text']
            },
            tokens: deliveryToken
        }
    }else{
        message = {
            notification: {
                title: 'Mensaje de Repartidor',
                body: data['text']
            },
            tokens: clientToken
        }
    }
    admin.messaging()
        .sendMulticast(message)
        .then((response) => {
            console.log("Successfully sent message:", response);
            return true
        })
        .catch((error) => {
            console.log("Error sending message:", error);
            return false
        });  
})


export const onCreateUser = functions.https.onRequest((req,res)=>{
    
    if(req.method == 'POST'){
        let headers = req.headers;
        let body = req.body;
        let envKey = process.env.KEY;
        if ('api-key' in headers){
            if (headers['api-key'] == envKey){
                let fullname = `${body.firstname} ${body.lastname}`
                let number =''
                if (body.phone.length == 10){
                    let substring = body.phone.substring(1);
                    number = `+593${substring}`
                }
                else{
                    res.send({sucess:false
                            ,error:{
                            code:"noenoughLen"}})
                    
                }
                admin.auth().createUser({
                    email: body.email,
                    emailVerified: false,
                    phoneNumber: number,
                    password: body.password,
                    displayName: fullname,
                    disabled: false,
                })
                .then(async (userRecord) => {
                    //let link = await admin.auth().generateEmailVerificationLink(userRecord.email!);
                    console.log('Successfully created new user:', userRecord.uid);
                
                    admin.firestore().collection('users').doc(userRecord.uid).set({
                        email:body.email,
                        lastname:body.lastname,
                        name:body.firstname,
                        phone:number,
                        cedula: body.cedula ? body.cedula : "NA",
                        placa: body.placa ? body.placa : "NA",
                        type:body.type,
                        status:true,
                        blocked:false
                    }).then((info)=>{
                        res.send({sucess:true,body:info})
                    }).catch((error) => {
                        res.send({sucess:false,body:'cant create user on db',error:error})
                      });
                    
                  })
                  .catch((error) => {
                    res.send({sucess:false,body:'cant create user on auth',error:error})
                  });
            }else{
                res.send('api key doesnt match')
            }
        }else{
            res.send('no api key found')   
        }      
    }else{
        res.send('Only post method allow')
    }
}) 

export const sendEmail = functions.firestore
    .document('users/{userId}')
    .onCreate(async (snap, context) => {
        
        const link = await admin.auth().generateEmailVerificationLink(snap.data().email);
        const mailOptions = {
            from: email_from,
            to: snap.data().email,
            subject: 'Confirmar Registro Go Ubi',
            html: `<!DOCTYPE html>
            <html>
            <head>
                <title>Confirmar registro</title>
                <style>
                .button {
                    background-color: #1c87c9;
                    border: none;
                    color: white;
                    padding: 20px 34px;
                    text-align: center;
                    text-decoration: none;
                    display: inline-block;
                    font-size: 20px;
                    margin: 4px 2px;
                    cursor: pointer;
                }
                </style>
            </head>
            <body>
                <h4>Registro de usuario!</h4>
                </br>
                <a href=${link} class="button">Click aqui!</a>
            </body>
            </html>`
        };

        transporter.sendMail(mailOptions, (error, data) => {
            if (error) {
                console.log(error)
                return
            }
            console.log("Sent!")
        });
    });


export const onDisableUser = functions.https.onRequest((req,res)=>{
    corsHandler(req, res, async () => {

        if(req.method == 'POST'){
            let headers = req.headers;
            let body = req.body;
            let envKey = process.env.KEY;
            if ('api-key' in headers){
                //res.set('Access-Control-Allow-Origin', '*');
                if (headers['api-key'] == envKey){
                    admin.firestore().collection('users').doc(body.uid).update({
                        blocked:body.flag
                    }).then((info)=>{
                        admin.auth().updateUser(body.uid,{disabled:body.flag}).then(()=>{
                            res.send({sucess:true})
                        }).catch((err)=>{
                            res.send({sucess:false,msg:err})
                        })
                    }).catch((error) => {
                        res.send({sucess:false,msg:error})
                    });
                    
                }else{
                    res.send('api key doesnt match')
                }
            }else{
                res.send('no api key found')   
            }      
        }else{
            res.send('Only post method allow')
        }
    })
    }) 


export const onMetrics = functions.https.onRequest((req,res)=>{
    corsHandler(req, res, async () => {

        if(req.method == 'GET'){
            let headers = req.headers;
            let envKey = process.env.KEY;
            if ('api-key' in headers){
                //res.set('Access-Control-Allow-Origin', '*');
                if (headers['api-key'] == envKey){
                    
                    const userReference = admin.firestore().collection("users");
                    const ordersReference = admin.firestore().collection("orders");

                    const userSnapshot  = await userReference.get();
                    const ordersSnapshot  = await ordersReference.get();
                    const userresults: any[] = [];
                    userSnapshot.forEach(doc => {
                        let userData = doc.data();
                        if (userData.type != 'client'){
                            let c1 = 0; //completas
                            let c2 = 0; // canceladas por user
                            let c3 = 0; // canceladas por delivery

                            ordersSnapshot.forEach(doc2 => { 
                                let orderData = doc2.data();
                                if (orderData.dui == doc.id){
                                    if(orderData.complete == true){
                                        c1++;
                                    }
                                    if(orderData.clientCancel == true){
                                        c2++;
                                    }
                                    if(orderData.deliveryCancel == true){
                                        c3++;
                                    }
                                }
                            })
                            if (userData.type != 'admin'){
                                userresults.push(
                                    {
                                        name: `${userData.name} ${userData.lastname}`,
                                        id : doc.id,
                                        c1,
                                        c2,
                                        c3,
                                        type: userData.type
                                    }
                                    );
                            }
                        }
                    });
                    
                    const usersInfo = await Promise.all(userresults);
                     res.send({data:usersInfo})
                }else{
                    res.send('api key doesnt match')
                }
            }else{
                res.send('no api key found')   
            }      
        }else{
            res.send('Only post method allow')
        }
    })
    }) 